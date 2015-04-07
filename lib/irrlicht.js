var debug = require( 'debug' )( 'IRRLICHT' )
var package = require( '../package' )
var Emitter = require( 'events' ).EventEmitter
var Stream = require( 'stream' )
var TCP = require( 'net' )
var HTTP = require( 'http' )
var HTTPS = require( 'https' )
var URL = require( 'url' )
var Path = require( 'path' )
var OS = require( 'os' )
var fs = require( 'fs' )
var async = require( 'async' )
var inherit = require( 'bloodline' )
var mkdirp = require( 'mkdirp' )
var BufferList = require( 'bl' )
var crypto = require( 'crypto' )

// Helper function for colored debug output
function inspect( value ) {
  return require( 'util' ).inspect( value, {
    colors: true,
  })
}

/**
 * Irrlicht constructor
 * @param {Object} options
 * @return {Irrlicht}
 */
function Irrlicht( options ) {
  
  if( !(this instanceof Irrlicht) )
    return new Irrlicht( options )
  
  debug( 'NEW', options )
  
  options = options != null ? options : {}
  options.ssl = options.ssl != null ? options.ssl : {}
  
  // Inherit from EventEmitter
  Emitter.call( this )
  
  // Record HTTP responses
  this.record = !!options.record
  // Replay saved HTTP responses
  this.replay = !!options.replay && !this.replay
  // Enable proxying to remotes
  // during HTTP replay
  this.enableNetwork = !!options.enableNetwork
  // Record & replay requests / responses
  // to local network interfaces
  this.ignoreLocal = options.ignoreLocal != null ?
    !!options.ignoreLocal : true
  // Where to store responses to & replay from
  this.path = options.path || Path.join( process.cwd(), 'fixtures' )
  // Force cache revalidation
  // NOTE: Implied by "record" mode
  this.noCache = !!options.noCache || this.record
  // MITM on SSL/TLS
  // NOTE: Implied by both, "record" and "replay"
  this.mitm = !!options.mitm ||
    this.record || this.replay
  
  // Interceptor routes
  this.routes = []
  
  this.httpAgent = new HTTP.Agent({
    maxSockets: options.maxSockets || 16,
  })
  
  this.httpsAgent = new HTTPS.Agent({
    maxSockets: options.maxSockets || 16,
    rejectUnauthorized: false,
  })
  
  // HTTPS server socket name (used for MITM)
  this.socket = Irrlicht.generateSocketName()
  
  this.http = new HTTP.Server()
  this.https = new HTTPS.Server({
    key: options.ssl.key || Irrlicht.SSL.SERVER.KEY,
    cert: options.ssl.cert || Irrlicht.SSL.SERVER.CERT,
    ca: options.ssl.ca || [ Irrlicht.SSL.CA.CERT ],
    rejectUnauthorized: false,
  })
  
  // Attach event handlers
  this._attachEvents()
  
  // Make fixture directories, if they do not yet exist
  if( this.record === true ) {
    mkdirp.sync( Path.join( this.path, 'meta' ) )
    mkdirp.sync( Path.join( this.path, 'data' ) )
  }
  
  // TODO: Handle this more robustly
  process.on( 'exit', function() {
    fs.unlinkSync( this.socket )
  }.bind( this ))
  
}

/**
 * Route
 * @type {Function}
 */
Irrlicht.Route = require( './route' )

/**
 * Recorder
 * @type {Function}
 */
Irrlicht.Recorder = require( './recorder' )

/**
 * Inbound/Outbound header transforms
 * @type {Object}
 */
Irrlicht.passes = require( './passes' )

/**
 * SSL keys, certificates, etc.
 * @type {Object}
 */
Irrlicht.SSL = require( '../certs' )

/**
 * Generates a socket name for
 * the HTTPS server to listen on
 * @return {String} filename
 */
Irrlicht.generateSocketName = function() {
  var filename = package.name + '-' + process.pid + '-' +
    (( Math.random() * 1e6 )|0).toString( 36 ) + '.sock'
  return Path.join( OS.tmpdir(), filename )
}

Irrlicht.isLocalhost = function( address ) {
  return /^(127\.0\.0\.1|::1|localhost)/i
    .test( address )
}

/**
 * Irrlicht prototype
 * @type {Object}
 */
Irrlicht.prototype = {
  
  /**
   * Irrlicht constructor
   * @type {Function}
   */
  constructor: Irrlicht,
  
  /**
   * Attaches event handlers to servers
   * @return {Undefined}
   */
  _attachEvents: function() {
    
    // Bind event handlers to own context
    this.handleConnect = this.handleConnect.bind( this )
    this.handleRequest = this.handleRequest.bind( this )
    this._onClose = this._onClose.bind( this )
    this._onError = this._onError.bind( this )
    
    this.http.on( 'request', this.handleRequest )
    this.http.on( 'connect', this.handleConnect )
    this.http.on( 'error', this._onError )
    
    this.https.on( 'request', this.handleRequest )
    this.https.on( 'close', this._onClose )
    this.https.on( 'error', this._onError )
    
    this.https.on( 'connection', function( socket ) {
      debug( 'HTTPS:CONNECTION' )
    })
    
  },
  
  /**
   * Handles forwarded 'error' events
   * from either of the servers
   * @param  {Error} error
   * @return {Undefined}
   */
  _onError: function( error ) {
    this.emit( 'error', error )
  },
  
  /**
   * Deletes the socket file on close
   * @return {Undefined}
   */
  _onClose: function() {
    fs.unlink( this.socket, Function.prototype )
  },
  
  /**
   * Construct `http(s).request()` options
   * from an incoming request
   * @param  {IncomingMessage} req
   * @return {Object} options
   */
  getRequestOptions: function( req ) {
    
    // Determine the transport protocol to be used
    // for the forwarding request
    var isEncrypted = req.isSpdy || req.connection.encrypted || req.connection.pair
    var protocol = isEncrypted ? 'https:' : 'http:'
    // Set up the request options
    var isFQDN = /^[^\/\:]+?\:\/\//.test( req.url )
    var options = isFQDN === false ?
      URL.parse( protocol + '//' + req.headers.host + req.url ) :
      URL.parse( req.url )
    
    options.method = req.method
    options.headers = Object.keys( req.headers )
      .reduce( function( headers, field ) {
        headers[ field ] = req.headers[ field ]
        return headers
      }, {})
    
    options.agent = isEncrypted ?
      this.httpsAgent : this.httpAgent
    
    return options
    
  },
  
  /**
   * Handles HTTP CONNECT method requests,
   * and forwards them to the HTTPS server
   * @param  {IncomingMessage} req
   * @param  {Socket} socket
   * @param  {Buffer} head
   * @return {Undefined}
   */
  handleConnect: function( req, socket, head ) {
    
    debug( 'HTTP:CONNECT', req.method, req.url )
    
    var self = this
    var proxy = null
    var target = URL.parse( 'tcp://' + req.url )
    var isEncrypted = target.port == 443 || /^https:/i.test( req.url )
    
    // Avoid node's net module being confused
    // and not append a port to a host with a port
    target.host = target.hostname
    delete target.href
    
    debug( 'HTTP:CONNECT', inspect( req.headers ) )
    debug( 'HTTP:CONNECT', inspect( target ) )
    
    var onConnection = function onConnection() {
      debug( 'HTTP:CONNECT', 'Connection established' )
      socket.write( 'HTTP/' + req.httpVersion + ' 200 Connection established\r\n\r\n' )
      proxy.write( head )
      proxy.pipe( socket )
      socket.pipe( proxy )
    }
    
    // Connect to the HTTPS proxy via the socket it's running on
    var proxy = null
    
    if( this.mitm && isEncrypted ) {
      debug( 'CONNECT:MITM:SSL/TLS' )
      proxy = new TCP.connect( self.socket, onConnection )
    } else if( this.mitm ) {
      debug( 'CONNECT:MITM:PLAIN' )
      var server = this.http.address()
      proxy = new TCP.connect( {
        hostname: server.address,
        port: server.port,
      }, onConnection )
    } else {
      debug( 'CONNECT:REMOTE' )
      proxy = new TCP.connect( target, onConnection )
    }
    
    // proxy.on( 'end', function() { socket.end() })
    // socket.on( 'end', function() { proxy.end() })
    socket.on( 'error', function( error ) {
      debug( 'ERROR', error )
      proxy.end()
    })
    
    proxy.on( 'error', function( error ) {
      debug( 'ERROR', 'Connection error', inspect( error ) )
      socket.write( 'HTTP/' + req.httpVersion + ' 500 Connection error\r\n\r\n' )
      socket.end()
    })
    
  },
  
  /**
   * Handles both HTTP & HTTPS requests
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @return {Undefined}
   */
  handleRequest: function( req, res ) {
    
    debug( 'HTTP:REQUEST', req.method, req.url )
    debug( 'HTTP:REQUEST', inspect( req.headers ) )
    
    var self = this
    var options = this.getRequestOptions( req )
    
    // Apply header passes for outbound requests
    Irrlicht.passes.outbound.forEach( function( pass ) {
      pass.call( self, req, res, options )
    })
    
    var routes = this.routes.filter( function( route ) {
      return route.match( req )
    })
    
    this.emit( 'request', req, res, options )
    
    if( routes.length > 0 ) {
      debug( 'INTERCEPT' )
      this._intercept( routes, req, res, options )
    } else if( this.record === true ) {
      debug( 'RECORD' )
      this.recordRequest( req, res, options )
    } else if( this.replay === true ) {
      debug( 'REPLAY' )
      this.replayRequest( req, res, options )
    } else {
      debug( 'PROXY' )
      this.proxyRequest( req, res, options )
    }
    
  },
  
  /**
   * Handles route interceptions
   * @param  {Array} routes
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @param  {Object} options
   * @return {Stream}
   */
  _intercept: function( routes, req, res, options ) {
    
    options = options == null ?
      this.getRequestOptions( req ) :
      options
    
    debug( 'HTTP:INTERCEPT', req.method, req.url )
    debug( 'HTTP:INTERCEPT', inspect( options.headers ) )
    debug( 'HTTP:INTERCEPT', inspect( routes ) )
    
    var self = this
    var local = routes.reduce( function( stream, route ) {
      var response = route.fn.call( self, req, res, options )
      return response instanceof Stream && response.writable ?
        stream.pipe( response ) : stream
    }, req )
    
    return local
    
  },
  
  /**
   * Handles outbound connections (the actual proxying)
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @return {ClientRequest} remote
   */
  proxyRequest: function( req, res, options ) {
    
    options = options == null ?
      this.getRequestOptions( req ) :
      options
    
    var self = this
    var isEncrypted = req.isSpdy || req.connection.encrypted || req.connection.pair
    var protocol = isEncrypted ? 'HTTPS' : 'HTTP'
    var transport = isEncrypted ? HTTPS : HTTP
    
    debug( protocol+':PROXY', req.method, req.url )
    debug( protocol+':PROXY', inspect( options.headers ) )
    
    var pipe = transport.request( options, function( remote ) {
      
      res.statusCode = remote.statusCode
      res.statusMessage = remote.statusMessage
      
      // Copy remote's headers to local response
      Object.keys( remote.headers ).forEach( function( field ) {
        res.setHeader( field, remote.headers[ field ] )
      })
      
      // Apply header passes for inbound responses
      Irrlicht.passes.inbound.forEach( function( pass ) {
        pass.call( self, req, res, remote, options )
      })
      
      // Write out header
      res.writeHead( res.statusCode )
      
      self.emit( 'response', req, remote, options )
      
      debug( protocol+':RESPONSE', inspect( res.statusCode ), req.url )
      debug( protocol+':RESPONSE', inspect( res._headers ) )
      
      // Append trailer headers & end the response
      remote.on( 'end', function() {
        if( remote.trailers )
          res.addTrailers( remote.trailers )
        res.end()
      })
      
      // Don't let the remote end the response for us,
      // since we may want to add trailer headers
      remote.pipe( res, { end: false })
      
    })
    
    // Forward the remote pipe's error to the request (?)
    pipe.on( 'error', function( error ) {
      debug( 'ERROR', error )
      debug( 'HTTP:RESPONSE', 500, req.url )
      res.writeHead( 500 )
      res.end( error.message )
      // req.emit( 'error', error )
    })
    
    return req.pipe( pipe )
    
  },
  
  /**
   * Records inbound HTTP responses while proxying
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @param  {Object} options
   * @return {Irrlicht.Recorder}
   */
  recordRequest: function( req, res, options ) {
    
    options = options == null ?
      this.getRequestOptions( req ) :
      options
    
    // Proxy requests to local network interfaces, if `ignoreLocal` is set
    if( this.ignoreLocal === true && Irrlicht.isLocalhost( options.host ) ) {
      return this.proxyRequest( req, res, options )
    }
    
    var self = this
    var isEncrypted = req.isSpdy || req.connection.encrypted || req.connection.pair
    var transport = isEncrypted ? HTTPS : HTTP
    
    var recorder = new Irrlicht.Recorder( this, options )
    
    // Create the outbound (to the remote endpoint) request
    var outbound = transport.request( options, function( remote ) {
      
      // Copy response status
      res.statusCode = remote.statusCode
      res.statusMessage = remote.statusMessage
      
      // Copy remote's headers to local response
      Object.keys( remote.headers ).forEach( function( field ) {
        res.setHeader( field, remote.headers[ field ] )
      })
      
      // Append trailer headers & end the response
      recorder.response.on( 'end', function() {
        if( remote.trailers )
          res.addTrailers( remote.trailers )
        res.end()
      })
      
      // Pipe the remote's response through the recorder,
      // which in turn is piped to the local response
      remote.pipe( recorder.response )
        .pipe( res, { end: false })
      
    })
    
    // TODO: Error handling
    outbound.on( 'error', function( error ) {
      debug( 'HTTP:RESPONSE', 500, req.url )
      debug( 'ERROR', error )
      res.statusCode = 500
      res.end( error.message )
    })
    
    // Pipe the local request through the recorder,
    // which in turn is piped to the outbound request
    req.pipe( recorder.request )
      .pipe( outbound )
    
    return recorder
    
  },
  
  /**
   * Replays recorded HTTP responses
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @param  {Object} options
   * @return {Undefined}
   */
  replayRequest: function( req, res, options ) {
    
    options = options == null ?
      this.getRequestOptions( req ) :
      options
    
    // Proxy requests to local network interfaces, if `ignoreLocal` is set
    if( this.ignoreLocal === true && Irrlicht.isLocalhost( options.host ) ) {
      return this.proxyRequest( req, res, options )
    }
    
    var self = this
    var util = require( './recorder/util' )
    var body = new BufferList()
    var hash = crypto.createHash( 'sha256' )
    var bodyHash = ''
    
    req.on( 'data', function( chunk ) {
      body.append( chunk )
      hash.update( chunk )
    })
    
    req.on( 'end', function() {
      
      bodyHash = hash.digest( 'hex' )
        .toUpperCase()
      
      var id = [
        req.method,
        util.hash( options.href ),
        util.hashHeaders( req.headers ),
        util.hash( bodyHash ),
        util.hashHeaders( req.trailers ),
      ].join( ':' )
      
      async.waterfall([
        function readMetadata( next ) {
          var filename = Path.join( self.path, 'meta', id )
          fs.readFile( filename, function( error, buffer ) {
            if( error ) return next( error )
            var data = null
            try { data = JSON.parse( buffer.toString() ) }
            catch( e ) { error = e }
            next( error, data )
          })
        },
        function readBody( metadata, next ) {
          var filename = Path.join( self.path, 'data', metadata.response.body )
          var stream = fs.createReadStream( filename )
          next( null, metadata, stream )
        }
      ], function( error, metadata, stream ) {
        
        // If a recorded response cannot be found,
        // and remote network is enabled, proxy the request
        if( error != null && self.enableNetwork ) {
          self.proxyRequest( req, res, options )
          return
        }
        
        // Otherwise respond with a 500
        if( error != null ) {
          res.writeHead( 500 )
          res.end( error.message )
          debug( 'REPLAY:ERROR', error )
          return
        }
        
        res.statusCode = metadata.response.statusCode
        res.statusMessage = metadata.response.statusMessage
        
        // Copy remote's headers to local response
        Object.keys( metadata.response.headers ).forEach( function( field ) {
          res.setHeader( field, metadata.response.headers[ field ] )
        })
        
        // Apply header passes for inbound responses
        Irrlicht.passes.replay.forEach( function( pass ) {
          pass.call( self, req, res, metadata )
        })
        
        res.writeHead( res.statusCode )
        
        // Append trailer headers & end the response
        stream.on( 'end', function() {
          if( metadata.response.trailers )
            res.addTrailers( metadata.response.trailers )
          res.end()
        })
        
        stream.pipe( res, { end: false })
        
      })
      
    })
    
  },
  
  /**
   * Listen on a given host & port
   * @param  {Number}   port
   * @param  {String}   host
   * @param  {Function} callback
   * @return {Irrlicht}
   */
  listen: function( port, host, callback ) {
    
    if( typeof host === 'function' ) {
      callback = host
      host = null
    }
    
    debug( 'LISTEN', port, host )
    
    var self = this
    var done = typeof callback === 'function' ?
      callback.bind( this ) : Function.prototype
    
    async.series([
      function( next ) { self.http.listen( port, host, next ) },
      function( next ) { self.https.listen( self.socket, next ) },
    ], function() {
      self.emit( 'listening' )
      done()
    })
    
    return this
    
  },
  
  /**
   * Close the Irrlicht proxy server
   * for new incoming connections
   * @param  {Function} callback
   * @return {Irrlicht}
   */
  close: function( callback ) {
    
    debug( 'CLOSE' )
    this.emit( 'close' )
    
    var self = this
    var done = typeof callback === 'function' ?
      callback.bind( this ) : Function.prototype
    
    async.series([
      function( next ) { self.http.close( next ) },
      function( next ) { self.https.close( next ) },
    ], done )
    
    return this
    
  },
  
}

// Inherit from EventEmitter
inherit( Irrlicht, Emitter )
// Exports
module.exports = Irrlicht

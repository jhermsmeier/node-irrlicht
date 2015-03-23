var debug = require( 'debug' )( 'IRRLICHT' )
var package = require( '../package' )
var Emitter = require( 'events' ).EventEmitter
var TCP = require( 'net' )
var HTTP = require( 'http' )
var HTTPS = require( 'https' )
var URL = require( 'url' )
var Path = require( 'path' )
var OS = require( 'os' )
var fs = require( 'fs' )
var async = require( 'async' )
var inherit = require( 'bloodline' )

/**
 * Irrlicht constructor
 * @param {Object} options
 * @return {Irrlicht}
 */
function Irrlicht( options ) {
  
  if( !(this instanceof Irrlicht) )
    return new Irrlicht( options )
  
  options = options != null ? options : {}
  
  // Inherit from EventEmitter
  Emitter.call( this )
  
  this.noCache = options.noCache != null ? options.noCache : false
  this.mitm = options.mitm != null ? options.mitm : false
  this.socket = Irrlicht.generateSocketName()
  
  this.httpAgent = new HTTP.Agent({
    maxSockets: options.maxSockets || 32,
  })
  
  this.httpsAgent = new HTTPS.Agent({
    maxSockets: options.maxSockets || 32,
  })
  
  this.http = new HTTP.Server()
  this.https = new HTTPS.Server( options.ssl || {
    key: Irrlicht.SSL.SERVER.KEY,
    cert: Irrlicht.SSL.SERVER.CERT,
    ca: [ Irrlicht.SSL.CA.CERT ],
  })
  
  // Bind event handlers to own context
  this._connectHandler = this._connectHandler.bind( this )
  this._requestHandler = this._requestHandler.bind( this )
  this._onClose = this._onClose.bind( this )
  this._onError = this._onError.bind( this )
  // Attach event handlers
  this._attachEvents()
  
  process.on( 'exit', function() {
    fs.unlinkSync( this.socket )
  }.bind( this ))
  
}

// Helper function to read certs, keys, etc.
function read( path ) {
  return fs.readFileSync(
    Path.join( __dirname, '..', 'certs', path )
  )
}

// Helper function for colored debug output
function inspect( value ) {
  return require( 'util' ).inspect( value, {
    colors: true,
  })
}

/**
 * Inbound/Outbound header transforms
 * @type {Object}
 */
Irrlicht.passes = require( './passes' )

/**
 * SSL keys, certificates, etc.
 * @type {Object}
 */
Irrlicht.SSL = {
  CA: {
    CERT: read( 'ca/root-ca.crt.pem' ),
    KEY: read( 'ca/root-ca.key.pem' ),
    SRL: read( 'ca/root-ca.srl' ),
  },
  CSR: read( 'csr/server.csr.pem' ),
  SERVER: {
    CERT: read( 'server/server.crt.pem' ),
    KEY: read( 'server/server.key.pem' ),
  },
  CLIENT: {
    KEY: read( 'client/server.pub' ),
  },
}

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
    
    this.http.on( 'request', this._requestHandler )
    this.http.on( 'connect', this._connectHandler )
    this.http.on( 'error', this._onError )
    
    this.https.on( 'request', this._requestHandler )
    this.https.on( 'close', this._onClose )
    this.https.on( 'error', this._onError )
    
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
   * Handles CONNECT method requests,
   * and forwards them to the HTTPS server
   * @param  {IncomingMessage} req
   * @param  {Socket} socket
   * @param  {Buffer} head
   * @return {Undefined}
   */
  _connectHandler: function( req, socket, head ) {
    
    debug( 'HTTP:CONNECT', req.method, req.url )
    
    var self = this
    var proxy = null
    var dest = this.mitm ? self.socket : 'tcp://' + req.headers.host
    var target = URL.parse( dest )
    
    var onConnection = function onConnection() {
      debug( 'HTTP:CONNECT', 'Connection established', inspect( target ) )
      socket.write( 'HTTP/' + req.httpVersion + ' 200 Connection established\r\n\r\n' )
      proxy.write( head )
      proxy.pipe( socket )
      socket.pipe( proxy )
    }
    
    // Connect to the HTTPS proxy via the socket it's running on
    var proxy = this.mitm ?
      new TCP.connect( dest, onConnection ) :
      new TCP.connect( target.port, target.hostname, onConnection )
    
    proxy.on( 'end', function() { socket.end() })
    socket.on( 'end', function() { proxy.end() })
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
  _requestHandler: function( req, res ) {
    
    debug( 'HTTP:REQUEST', req.method, req.url )
    debug( 'HTTP:REQUEST', inspect( req.headers ) )
    
    var self = this
    var options = this.getRequestOptions( req )
    
    // Apply header passes for outbound requests
    Irrlicht.passes.outbound.forEach( function( pass ) {
      pass.call( self, req, res, options )
    })
    
    this.emit( 'request', req, res, options )
    this._proxy( req, res, options )
    
  },
  
  /**
   * Handles outbound connections (the actual proxying)
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @return {ClientRequest} remote
   */
  _proxy: function( req, res, options ) {
    
    var self = this
    var isEncrypted = req.isSpdy || req.connection.encrypted || req.connection.pair
    var transport = isEncrypted ? HTTPS : HTTP
    
    var pipe = transport.request( options, function( remote ) {
      
      debug( 'HTTP:PROXY', req.method, req.url )
      debug( 'HTTP:PROXY', inspect( options.headers ) )
      
      this.emit( 'response', req, remote, options )
      
      // Copy remote's headers to local response
      Object.keys( remote.headers ).forEach( function( field ) {
        res.setHeader( field, remote.headers[ field ] )
      })
      
      // Apply header passes for inbound responses
      Irrlicht.passes.inbound.forEach( function( pass ) {
        pass.call( self, req, res, remote, options )
      })
      
      // Write out header
      res.writeHead( remote.statusCode, remote.statusMessage )
      
      debug( 'HTTP:RESPONSE', inspect( res.statusCode ), req.url )
      debug( 'HTTP:RESPONSE', inspect( res._headers ) )
      
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
  
  getRequestOptions: function( req ) {
    
    // Determine the transport protocol to be used
    // for the forwarding request
    var isHTTPS = req.client.server === this.https
    var protocol = isHTTPS ? 'https:' : 'http:'
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
    
    options.agent = isHTTPS ?
      this.httpsAgent : this.httpAgent
    
    return options
    
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

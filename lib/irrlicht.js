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
    
    debug( 'HTTP:CONNECT', req.url )
    
    var self = this
    // Connect to the HTTPS proxy via the socket it's running on
    var proxy = new TCP.connect( self.socket, function() {
      debug( 'HTTP:CONNECT', 'Connection established' )
      proxy.write( head )
      socket.write( 'HTTP/' + req.httpVersion + ' 200 Connection established\r\n\r\n' )
      socket.pipe( proxy )
      proxy.pipe( socket )
    })
    
    proxy.on( 'end', function() { socket.end() })
    socket.on( 'end', function() { proxy.end() })
    socket.on( 'error', function( error ) {
      debug( 'ERROR', error )
      proxy.end()
    })
    
    proxy.on( 'error', function( error ) {
      debug( 'ERROR', 'Connection error', error )
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
    debug( 'HTTP:REQUEST', req.headers )
    
    this.emit( 'request', req, res )
    this._proxy( req, res )
    
  },
  
  _proxyRequest: function( req, res, callback ) {
    
    var options = this.getRequestOptions( req )
    var transport = /^https/i.test( options.protocol ) ? HTTPS : HTTP
    var done = callback.bind( this )
    var pipe = transport.request( options, function( remote ) {
      done( req, remote, options )
    })
    
    return pipe
    
  },
  
  /**
   * Handles outbound connections (the actual proxying)
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @return {ClientRequest} remote
   */
  _proxy: function( req, res, options ) {
    
    var pipe = this._proxyRequest( req, res, function( req, remote ) {
      
      debug( 'HTTP:RESPONSE', remote.statusCode, req.url )
      debug( 'HTTP:RESPONSE', remote.headers )
      
      this.emit( 'response', req, remote )
      
      // Copy the remote's response over
      res.writeHead(
        remote.statusCode,
        remote.statusMessage,
        remote.headers
      )
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
  
  _diskSave: function( req, res, options ) {
    
    
    
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
    options.headers = req.headers
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

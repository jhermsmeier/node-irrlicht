var debug = require( 'debug' )( 'IRRLICHT' )
var package = require( '../package' )
var TCP = require( 'net' )
var HTTP = require( 'http' )
var HTTPS = require( 'https' )
var URL = require( 'url' )
var Path = require( 'path' )
var OS = require( 'os' )
var fs = require( 'fs' )
var async = require( 'async' )

/**
 * Irrlicht constructor
 * @param {Object} options
 * @return {Irrlicht}
 */
function Irrlicht( options ) {
  
  if( !(this instanceof Irrlicht) )
    return new Irrlicht( options )
  
  options = options != null ? options : {}
  
  this.socket = Irrlicht.generateSocketName()
  
  this.httpAgent = new HTTP.Agent({ maxSockets: 32 })
  this.httpsAgent = new HTTPS.Agent({ maxSockets: 32 })
  
  this.http = new HTTP.Server()
  this.https = new HTTPS.Server( options.ssl || {
    key: Irrlicht.SSL.SERVER.KEY,
    cert: Irrlicht.SSL.SERVER.CERT,
    ca: [ Irrlicht.SSL.CA.CERT ],
  })
  
  this.http.on( 'connect', this._connectHandler.bind( this ) )
  this.http.on( 'request', this._requestHandler.bind( this ) )
  this.https.on( 'request', this._requestHandler.bind( this ) )
  this.https.on( 'close', this._onClose.bind( this ) )
  
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
    
    debug( 'HTTP CONNECT', req.url )
    
    var self = this
    // Connect to the HTTPS proxy via the socket it's running on
    var proxy = new TCP.connect( self.socket, function() {
      debug( 'HTTP CONNECT', 'Connection established' )
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
      debug( 'ERROR', error )
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
    
    this._proxy( req, res )
    
    debug( 'HTTP REQUEST', req.url )
    debug( 'HTTP REQUEST', {
      httpVersion: req.httpVersion,
      method: req.method,
      url: req.url,
      headers: req.headers,
    })
    
  },
  
  /**
   * Handles outbound connections (the actual proxying)
   * @param  {IncomingMessage} req
   * @param  {ServerResponse} res
   * @return {ClientRequest} remote
   */
  _proxy: function( req, res ) {
    
    // Determine the transport protocol to be used
    // for the forwarding request
    var isHTTPS = req.client.server === this.https
    var transport = isHTTPS ? HTTPS : HTTP
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
    
    var pipe = transport.request( options, function( remote ) {
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
      res.writeHead( 500 )
      res.end( error.message )
      // req.emit( 'error', error )
    })
    
    return req.pipe( pipe )
    
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
      callback.bind( this ) : null
    
    async.series([
      function( next ) { self.http.listen( port, host, next ) },
      function( next ) { self.https.listen( self.socket, next ) },
    ], done )
    
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
    
    var self = this
    var done = typeof callback === 'function' ?
      callback.bind( this ) : null
    
    async.series([
      function( next ) { self.http.close( next ) },
      function( next ) { self.https.close( next ) },
    ], done )
    
    return this
    
  },
  
}

// Exports
module.exports = Irrlicht

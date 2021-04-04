var Stream = require( 'stream' )
var Path = require( 'path' )
var fs = require( 'fs' )
var debug = require( 'debug' )( 'IRRLICHT:RECORDER' )
var async = require( 'async' )

/**
 * Recorder
 * @param {irrlicht} irrlicht
 * @param {Object} options
 * @return {Recorder}
 */
function Recorder( irrlicht, options ) {
  
  if( !(this instanceof Recorder) )
    return new Recorder( irrlicht, options )
  
  debug( 'NEW' )
  
  this.irrlicht = irrlicht
  this.options = options
  
  this.request = new Recorder.Request( this )
  this.response = new Recorder.Response( this )
  
  this.response.on( 'end', this._onEnd.bind( this ) )
  
}

Recorder.Request = require( './request' )
Recorder.Response = require( './response' )

/**
 * Recorder prototype
 * @type {Object}
 */
Recorder.prototype = {
  
  constructor: Recorder,
  
  getMetaData: function() {
    return {
      id: this.request.id,
      request: {
        method: this.request.method,
        href: this.request.href,
        headers: this.request.headers,
        trailers: this.request.trailers,
        body: this.request.bodyHash,
      },
      response: {
        statusCode: this.response.statusCode,
        statusMessage: this.response.statusMessage,
        href: this.response.href,
        headers: this.response.headers,
        trailers: this.response.trailers,
        body: this.response.bodyHash,
      },
    }
  },
  
  _onEnd: function() {
    
    var self = this
    
    // Read & Write fs permission flags
    var permission = fs.R_OK | fs.W_OK
    var metadata = this.getMetaData()
    var metafile = Path.join(
      this.irrlicht.path, 'meta',
      metadata.id
    )
    var bodyfile = Path.join(
      this.irrlicht.path, 'data',
      metadata.response.body
    )
    
    // debug( 'METAFILE', metafile )
    // debug( 'BODYFILE', bodyfile )
    debug( 'METADATA', metadata )
    
    async.series([
      function saveMetaData( next ) {
        fs.writeFile( metafile, JSON.stringify( metadata, null, 2 ), { flag: 'wx' }, next )
      },
      function saveBody( next ) {
        fs.writeFile( bodyfile, self.response.buffer, { flag: 'wx' }, next )
      },
    ], function done( error, results ) {
      if( error != null ) {
        debug( 'ERROR', error )
        return void 0
      }
      debug( 'SUCCESS' )
    })
    
  },
  
}

// Exports
module.exports = Recorder

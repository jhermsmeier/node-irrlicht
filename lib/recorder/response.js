var Stream = require( 'stream' )
var BufferList = require( 'bl' )
var crypto = require( 'crypto' )
var inherit = require( 'bloodline' )
var debug = require( 'debug' )( 'IRRLICHT:RECORDER:RESPONSE' )
var util = require( './util' )

/**
 * ResponseTape
 * @param {Recorder} recorder
 * @param {Object} [options]
 * @return {ResponseTape}
 */
function ResponseTape( recorder, options ) {
  
  if( !(this instanceof ResponseTape) )
    return new ResponseTape( options )
  
  Stream.Transform.call( this, options )
  
  this.statusCode = 0
  this.statusMessage = ''
  this.href = ''
  this.headers = {}
  this.trailers = {}
  this.body = new BufferList()
  this.bodyHash = ''
  
  this.recorder = recorder
  // The inbound response
  this.source = null
  this.hash = crypto.createHash( 'sha256' )
  
  this.on( 'pipe', this._onPipe )
  
}

/**
 * ResponseTape prototype
 * @type {Object}
 */
ResponseTape.prototype = {
  
  constructor: ResponseTape,
  
  get buffer() {
    return this.body.slice()
  },
  
  _onPipe: function( source ) {
    
    debug( 'PIPE' )
    
    this.statusCode = source.statusCode
    this.statusMessage = source.statusMessage
    this.href = this.recorder.request.href
    this.headers = source.headers
    this.trailers = source.trailers
    this.body = new BufferList()
    
    this.source = source
    
  },
  
  _transform: function( chunk, encoding, next ) {
    this.body.append( chunk )
    this.hash.update( chunk )
    next( null, chunk )
  },
  
  _flush: function( done ) {
    done()
    debug( 'FLUSH' )
    this.trailers = this.source.trailers
    this.bodyHash = this.hash.digest( 'hex' )
      .toUpperCase()
  },
  
}

inherit( ResponseTape, Stream.Transform )
// Exports
module.exports = ResponseTape

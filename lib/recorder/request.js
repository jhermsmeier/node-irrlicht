var Stream = require( 'stream' )
var BufferList = require( 'bl' )
var crypto = require( 'crypto' )
var inherit = require( 'bloodline' )
var debug = require( 'debug' )( 'IRRLICHT:RECORDER:REQUEST' )
var util = require( './util' )

/**
 * RequestTape
 * @param {Recorder} recorder
 * @param {Object} [options]
 * @return {RequestTape}
 */
function RequestTape( recorder, options ) {
  
  if( !(this instanceof RequestTape) )
    return new RequestTape( options )
  
  Stream.Transform.call( this, options )
  
  this.id = ''
  
  this.method = ''
  this.href = ''
  this.headers = {}
  this.trailers = {}
  this.body = new BufferList()
  this.bodyHash = ''
  
  this.recorder = recorder
  // The outbound request
  this.source = null
  this.hash = crypto.createHash( 'sha256' )
  
  this.on( 'pipe', this._onPipe )
  
}

/**
 * RequestTape prototype
 * @type {Object}
 */
RequestTape.prototype = {
  
  constructor: RequestTape,
  
  get buffer() {
    return this.body.slice()
  },
  
  _onPipe: function( source ) {
    
    debug( 'PIPE' )
    
    this.method = source.method
    this.href = this.recorder.options.href
    this.headers = source.headers
    this.trailers = source.trailers
    this.body = new BufferList()
    
    this.source = source
    
  },
  
  _transform: function( chunk, encoding, next ) {
    debug( 'TRANSFORM' )
    this.body.append( chunk )
    this.hash.update( chunk )
    next( null, chunk )
  },
  
  _flush: function( done ) {
    debug( 'FLUSH' )
    // Add trailers
    this.trailers = this.source.trailers
    // Hash the request body
    this.bodyHash = this.hash.digest( 'hex' )
      .toUpperCase()
    // Generate the request's id
    this.id = [
      this.method,
      util.hash( this.href ),
      util.hashHeaders( this.headers ),
      util.hash( this.bodyHash ),
      util.hashHeaders( this.trailers ),
    ].join( ':' )
    // End
    done()
  },
  
}

inherit( RequestTape, Stream.Transform )
// Exports
module.exports = RequestTape

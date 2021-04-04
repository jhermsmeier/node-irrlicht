var Stream = require( 'stream' )
var BufferList = require( 'bl' )
var crypto = require( 'crypto' )
var debug = require( 'debug' )( 'IRRLICHT:RECORDER:RESPONSE' )
var util = require( './util' )

class ResponseTape extends Stream.Transform {

  /**
   * ResponseTape
   * @param {Recorder} recorder
   * @param {Object} [options]
   * @return {ResponseTape}
   */
  constructor( recorder, options ) {

    super( options )

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

  get buffer() {
    return this.body.slice()
  }

  _onPipe( source ) {

    debug( 'PIPE' )

    this.statusCode = source.statusCode
    this.statusMessage = source.statusMessage
    this.href = this.recorder.request.href
    this.headers = source.headers
    this.trailers = source.trailers
    this.body = new BufferList()

    this.source = source

  }

  _transform( chunk, encoding, next ) {
    this.body.append( chunk )
    this.hash.update( chunk )
    next( null, chunk )
  }

  _flush( done ) {
    done()
    debug( 'FLUSH' )
    this.trailers = this.source.trailers
    this.bodyHash = this.hash.digest( 'hex' )
      .toUpperCase()
  }

}

// Exports
module.exports = ResponseTape

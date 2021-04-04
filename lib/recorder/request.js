var Stream = require( 'stream' )
var BufferList = require( 'bl' )
var crypto = require( 'crypto' )
var debug = require( 'debug' )( 'IRRLICHT:RECORDER:REQUEST' )
var util = require( './util' )

class RequestTape extends Stream.Transform {

  /**
   * RequestTape
   * @param {Recorder} recorder
   * @param {Object} [options]
   * @return {RequestTape}
   */
  constructor( recorder, options ) {

    super( options )

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

  get buffer() {
    return this.body.slice()
  }

  _onPipe( source ) {

    debug( 'PIPE' )

    this.method = source.method
    this.href = this.recorder.options.href
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
    // End
    done()
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

    debug( 'FLUSH' )
  }

}

// Exports
module.exports = RequestTape

var package = require( '../../package' )

module.exports = [
  
  function via( req, res, options ) {
    options.headers[ 'via' ] = 
      ( options.headers[ 'via' ] || '' ) +
      ( options.headers[ 'via' ] ? ', ' : '' ) +
      ( 'HTTP/' + req.httpVersion + ' ' + package.name )
  },
  
  function cacheControl( req, res, options ) {
    if( this.noCache ) {
      options.headers[ 'cache-control' ] = 'no-cache'
      options.headers[ 'pragma' ] = 'no-cache'
      delete options.headers[ 'if-modified-since' ]
      delete options.headers[ 'if-none-match' ]
    }
  },
  
  function keepAlive( req, res, options ) {
    options.headers[ 'connection' ] = 'keep-alive'
  },
  
  function deleteLength( req, res, options ) {
    if( req.method === 'DELETE' || req.method === 'OPTIONS' ) {
      if( !req.headers[ 'content-length' ] ) {
        options.headers[ 'content-length' ] = '0'
      }
    }
  },
  
]

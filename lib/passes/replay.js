var cookie = require( 'cookie' )

module.exports = [
  
  function newDate( req, res, meta ) {
    res.removeHeader( 'date' )
    res.setHeader( 'date', new Date().toUTCString() )
  },
  
  function updateExpires( req, res, meta ) {
    var header = res.getHeader( 'expires' )
    if( header != null ) {
      var expires = new Date( header ).getTime()
      var date = new Date( meta.response.headers[ 'date' ] ).getTime()
      var delta = expires - date
      var updated = new Date( Date.now() + delta )
      res.removeHeader( 'expires' )
      res.setHeader( 'expires', updated.toUTCString() )
    }
  },
  
  function updateCookieExpires( req, res, meta ) {
    var headers = res.getHeader( 'set-cookie' )
    if( headers != null ) {
      
      // Not sure if this is necessary,
      // or if all headers are removed in case of multiples
      while( res.getHeader( 'set-cookie' ) )
        res.removeHeader( 'set-cookie' )
      
      var cookies = [].concat( headers )
        .map( function( header ) {
          // Find the actual key data is stored under
          var key = header.substring( 0, header.indexOf( '=' ) )
          var data = cookie.parse( header )
          var value = data[ key ]
          delete data[ key ]
          if( data.expires != null ) {
            var date = new Date( meta.response.headers[ 'date' ] ).getTime()
            var expires = new Date( data.expires ).getTime()
            var delta = expires - date
            var updated = new Date( Date.now() + delta )
            data.expires = updated.toUTCString()
          }
          return cookie.serialize( key, value, data )
        })
      
      res.setHeader( 'set-cookie', cookies )
      
    }
  },
  
]

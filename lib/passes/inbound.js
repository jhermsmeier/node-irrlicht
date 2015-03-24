var package = require( '../../package' )

module.exports = [
  
  function noCache( req, res, remote, options ) {
    if( this.noCache ) {
      res.setHeader( 'cache-control', 'max-age=0, private, must-revalidate' )
    }
  },
  
  function forwardedFor( req, res, remote, options ) {
    
    var fields = {
      for: req.connection.remoteAddress || req.socket.remoteAddress,
      port: req.connection.remotePort,
      proto: /^https/i.test( remote.protocol ) ? 'https' : 'http'
    }
    
    void [ 'for', 'port', 'proto' ].forEach( function( type ) {
      res.setHeader( 'x-forwarded-' + type,
        ( remote.headers[ 'x-forwarded-' + type ] || '' ) +
        ( remote.headers[ 'x-forwarded-' + type ] ? ', ' : '' ) +
        fields[ type ]
      )  
    })
    
  },
  
]

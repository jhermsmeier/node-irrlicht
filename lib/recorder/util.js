var farmhash = require( 'farmhash' )
var util = module.exports

util.hash = function( str ) {
  return farmhash.fingerprint32( str )
    .toString( 16 )
    .toUpperCase()
}

util.hashHeaders = function( header ) {
  return util.hash([
    ( header[ 'host' ] || '' ),
    ( header[ 'accept' ] || '' ),
    ( header[ 'cookie' ] || '' ),
    ( header[ 'accept-encoding' ] || '' ),
    ( header[ 'accept-language' ] || '' ),
    ( header[ 'content-type' ] || '' ),
    ( header[ 'content-length' ] || '' ),
  ].join( ':' ))
}

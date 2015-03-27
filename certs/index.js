var Path = require( 'path' )
var fs = require( 'fs' )

// Helper function to read certs, keys, etc.
function read( path ) {
  return fs.readFileSync(
    Path.join( __dirname, '..', 'certs', path )
  )
}

module.exports = {
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

#!/usr/bin/env node
var package = require( '../package' )
var fs = require( 'fs' )
var Irrlicht = require( '..' )
var argv = require( 'yargs' )
  .usage( 'Usage: irrlicht [options]' )
  .help( 'help' )
  .alias( 'help', 'h' )
  .version( package.version, 'version' )
  .alias( 'version', 'v' )
  .option( 'port', {
    alias: 'p',
    default: 8989,
    describe: 'Port to run the proxy on',
    type: 'number',
  })
  .option( 'host', {
    alias: 'H',
    describe: 'Hostname to bind to (optional)',
    type: 'string',
  })
  .option( 'no-cache', {
    default: false,
    describe: 'Force cache revalidation',
    type: 'boolean',
  })
  .option( 'mitm', {
    default: false,
    describe: 'Enable MITM on SSL/TLS',
    type: 'boolean',
  })
  .option( 'ca', {
    describe: 'SSL CA Certificate path',
    type: 'string',
  })
  .option( 'cert', {
    describe: 'SSL Certificate path',
    type: 'string',
  })
  .option( 'key', {
    describe: 'SSL Certificate Key path',
    type: 'string',
  })
  .argv

function read( path ) {
  return fs.readFileSync( path )
}

var proxy = new Irrlicht({
  mitm: argv.mitm,
  ssl: {
    key: argv.key && read( argv.key ),
    cert: argv.cert && read( argv.cert ),
    ca: argv.ca && [ read( argv.ca ) ],
  },
})

proxy.listen( argv.port, argv.host, function() {
  console.log(
    'Irrlicht', package.version,
    'listening on', this.http.address()
  )
})

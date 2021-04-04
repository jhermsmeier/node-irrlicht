#!/usr/bin/env node
var package = require( '../package' )
var fs = require( 'fs' )
var Irrlicht = require( '..' )
var argv = require( 'yargs' )
  .usage( 'Usage: irrlicht [command] [options]' )
  .command( 'record', 'Record HTTP responses (implies MITM, no-cache)' )
  .command( 'replay', 'Replay recorded HTTP responses (implies MITM)' )
  .help( 'help' )
  .alias( 'help', 'h' )
  .version( 'version', package.version )
  .alias( 'version', 'v' )
  .option( 'port', {
    alias: 'p',
    default: 8989,
    describe: 'Port to run the proxy on',
    type: 'number',
  })
  .option( 'host', {
    alias: 'H',
    describe: 'Hostname to bind to',
    type: 'string',
  })
  .option( 'enable-cache', {
    default: false,
    describe: 'Disable forced cache revalidation',
    type: 'boolean',
  })
  .option( 'disable-network', {
    default: true,
    describe: 'Enable proxying to remotes during replay',
    type: 'boolean',
  })
  .option( 'ignore-local', {
    default: true,
    describe: 'Record & replay on local interfaces',
    type: 'boolean',
  })
  .option( 'fixtures', {
    alias: 'f',
    describe: 'Fixture data path',
    type: 'string',
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
  record: !!~argv._.indexOf( 'record' ),
  replay: !!~argv._.indexOf( 'replay' ),
  path: argv.fixtures,
  noCache: !argv.enableCache,
  enableNetwork: !argv.disableNetwork,
  ignoreLocal: argv.ignoreLocal,
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

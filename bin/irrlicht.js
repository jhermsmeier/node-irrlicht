#!/usr/bin/env node
var package = require( '../package' )
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
  .option( 'cert', {
    describe: 'SSL Certificate path',
    type: 'string',
  })
  .option( 'key', {
    describe: 'SSL Certificate Key path',
    type: 'string',
  })
  .argv

var proxy = new Irrlicht({
  ssl: { key: argv.key, cert: argv.cert },
})

proxy.listen( argv.port, argv.host, function() {
  console.log(
    'Irrlicht', package.version,
    'listening on', this.http.address()
  )
})

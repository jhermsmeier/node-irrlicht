# Irrlicht
[![npm](http://img.shields.io/npm/v/irrlicht.svg?style=flat-square)](https://npmjs.com/irrlicht)
[![npm downloads](http://img.shields.io/npm/dm/irrlicht.svg?style=flat-square)](https://npmjs.com/irrlicht)
[![build status](http://img.shields.io/travis/jhermsmeier/node-irrlicht.svg?style=flat-square)](https://travis-ci.org/jhermsmeier/node-irrlicht)

## Install via [npm](https://npmjs.com)

```sh
$ npm install irrlicht
```

## Command Line

```sh
$ npm install --global irrlicht
```

```
Usage: irrlicht [options]

Options:
  --help, -h     Show help
  --version, -v  Show version number
  --port, -p     Port to run the proxy on                        [default: 8989]
  --host, -H     Hostname to bind to (optional)
  --ca           SSL CA Certificate path
  --cert         SSL Certificate path
  --key          SSL Certificate Key path
```

## Usage

```js
var Irrlicht = require( 'Irrlicht' )
```

```js
var proxy = new Irrlicht({
  // Optional. Key & cert for proxying HTTPS connections
  // For details, see https://iojs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener
  ssl: {
    key: '...',
    cert: '...',
    ca: [ '...' ],
  },
})
```

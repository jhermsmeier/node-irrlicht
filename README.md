# Irrlicht
[![npm](http://img.shields.io/npm/v/irrlicht.svg?style=flat-square)](https://npmjs.com/irrlicht)
[![npm downloads](http://img.shields.io/npm/dm/irrlicht.svg?style=flat-square)](https://npmjs.com/irrlicht)
[![build status](http://img.shields.io/travis/jhermsmeier/node-irrlicht.svg?style=flat-square)](https://travis-ci.org/jhermsmeier/node-irrlicht)

**Irrlicht**, the German name for will-o'-the-wisp,
the ghostly light sometimes seen at night over bogs and swamps.

## Install via [npm](https://npmjs.com)

```sh
$ npm install irrlicht
```

## Command Line

```sh
$ npm install --global irrlicht
```

```
Usage: irrlicht [command] [options]

Commands:
  record    Record HTTP responses (implies MITM, no-cache)
  replay    Replay recorded HTTP responses (implies MITM)

Options:
  --help, -h      Show help
  --version, -v   Show version number
  --fixtures, -f  Fixture data path
  --port, -p      Port to run the proxy on                       [default: 8989]
  --host, -H      Hostname to bind to (optional)
  --no-cache      Force cache revalidation                      [default: false]
  --mitm          Enable MITM on SSL/TLS                        [default: false]
  --ca            SSL CA Certificate path
  --cert          SSL Certificate path
  --key           SSL Certificate Key path
```

## Usage

```js
var Irrlicht = require( 'Irrlicht' )
```

```js
var proxy = new Irrlicht({
  // Enable HTTP response recording
  record: false,
  // Enable HTTP response replay from storage
  replay: false,
  // Fixture data path
  path: process.cwd() + 'fixtures'
  // Whether to MITM on SSL/TLS with given certs,
  // or if none are given, with local self-signed certs
  mitm: false,
  // Optional. Key & cert for proxying HTTPS connections
  // For details, see https://iojs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener
  ssl: {
    key: '...',
    cert: '...',
    ca: [ '...' ],
  },
})
```

```js
// Start listening on a given port (and optionally, host)
proxy.listen( port[, host], function() {
  console.log( 'Proxying HTTP via', this.http.address() )
  console.log( 'Proxying HTTPS via', this.https.address() )
})
```

## API

### Function `new Irrlicht( options )`

- **Object `options`:**
  - **Boolean `record`:** Whether to record HTTP responses
  - **Boolean `replay`:** Whether to replay saved HTTP responses
  - **String `path`:** Fixture data path
  - **Boolean `noCache`:** Force cache revalidation
  - **Number `maxSockets`:** Maximum number of sockets for **each** server
  - **Object `ssl`:** For more detail, see [iojs.org/api/tls](https://iojs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener)
    - **Buffer|String `key`:** The private key of the server in PEM format
    - **Array|Buffer|String `cert`:** The certificate key of the server in PEM format
    - **Array `ca`:** Trusted certificates in PEM format
    - **Array|String `crl`:** PEM encoded CRs (Certificate Revocation List)
    - **String `ciphers`:** The ciphers to use or exclude, seperated by `:`

#### Properties

- **String `socket`:** Filename of HTTPS socket
- **Agent `httpAgent`:** HTTP socket pooling agent
- **Agent `httpsAgent`:** HTTPS socket pooling agent
- **Server `http`:** HTTP server
- **Server `https`:** HTTPS server
- **Boolean `record`:** Whether to record HTTP responses
- **Boolean `replay`:** Whether to replay saved HTTP responses
- **String `path`:** Fixture data path
- **Boolean `noCache`:** Whether to force cache revalidation
- **Boolean `mitm`:** Whether to MITM SSL/TLS connections

#### Methods

##### `listen( port[, host][, callback] )`
##### `close( [callback] )`

#### Events

- `error` ( error )
- `request` ( request, response )
- `response` ( request, remoteResponse )
- `listening`
- `close`

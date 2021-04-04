var debug = require( 'debug' )( 'IRRLICHT:ROUTE' )
var URL = require( 'url' )
var pathToRegExp = require( 'path-to-regexp' )

/**
 * Route constructor
 * @return {Route}
 */
function Route() {

  if( !(this instanceof Route) )
    return new Route()

  this._domains = []
  this._methods = []
  this._patterns = []

  this.fn = null

}

/**
 * RegExp special chars
 * @type {RegExp}
 */
const unsafe = /[(){}\[\]\\\/.:+-?$^|*=]/g

/**
 * Create a regular expression from given pattern
 * @param  {String|RegExp} pattern
 * @return {RegExp}
 */
Route.createDomainRule = function( pattern ) {

  if( pattern instanceof RegExp )
    return pattern

  var exp = ( pattern + '' )
    .replace( unsafe, '\\$&' )
    .replace( /\\\\\*/, '(.*)' )

  return new RegExp( '^' + exp, 'i' )

}

/**
 * Create a regular expression from given pattern
 * @param  {String|RegExp} pattern
 * @return {RegExp}
 */
Route.createPathRule = function( pattern ) {
  return ( pattern instanceof RegExp ) ?
    pattern : pathToRegExp( pattern + '' )
}

/**
 * Sequentially matches an array of
 * patterns against a given value
 * @param  {Array} patterns
 * @param  {String} value
 * @return {Boolean}
 */
Route.matchPatterns = function( patterns, value ) {

  var pattern = null

  if( patterns.length ) {
    while( pattern = patterns.shift() ) {
      debug( 'MATCH:PATTERN', pattern, value, !pattern.test( value ) )
      if( !pattern.test( value ) )
        return false
    }
  }

  return true

}

/**
 * Route prototype
 * @type {Object}
 */
Route.prototype = {

  constructor: Route,

  /**
   * Use a given function to
   * handle the routed request
   * @param  {Function} fn
   * @return {Router}
   */
  use: function( fn ) {
    if( typeof fn === 'function' )
      this.fn = fn
    return this
  },

  /**
   * Adds a domain matching rule
   * @param  {String|RegExp} pattern
   * @return {Route}
   */
  domain: function( pattern ) {
    var rule = Route.createDomainRule( pattern )
    this._domains.push( rule )
    return this
  },

  /**
   * Adds an HTTP method matching rule
   * @param  {String} method
   * @return {Route}
   */
  method: function( method ) {
    method = method + ''
    method = method.toUpperCase()
    this._methods.push( method )
    return this
  },

  /**
   * Adds a path matching rule
   * @param  {String|RegExp} pattern
   * @return {Route}
   */
  path: function( pattern ) {
    var rule = Route.createPathRule( pattern )
    this._patterns.push( rule )
    return this
  },

  /**
   * Determines whether the route
   * matches a given request
   * @param  {IncomingMessage} request
   * @return {Boolean} match
   */
  match: function( request ) {

    debug( 'MATCH', request.headers.host, URL.parse( request.url ).path )

    var domain = this._domains.length ?
      Route.matchPatterns(
        this._domains.slice(),
        request.headers.host
      ) : true

    var method = this._methods.length ?
      !!~this._methods.indexOf(
        request.method.toUpperCase()
      ) : true

    var path = this._patterns.length ?
      Route.matchPatterns(
        this._patterns.slice(),
        request.path
      ) : true

    debug( 'MATCH', domain && method && path )

    return domain && method && path

  },

}

// Exports
module.exports = Route

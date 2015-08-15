'use strict';

var Irrlicht = require( '..' )
var assert = require( 'assert' )

describe('Irrlicht', function() {
  describe( 'Initialization', function() {
    it( 'should return object when calling constructor', function() {
      assert.doesNotThrow(function() {
        assert.equal(typeof new Irrlicht(), 'object')
      })
    })    
  })
})

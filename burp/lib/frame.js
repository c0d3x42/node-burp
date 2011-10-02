var inspect = require('sys').inspect;

var myEnv = require('schema')('burpFrame', {} );

exports.BurpPayloadChannelStart = myEnv.Schema.create({
  type: 'object',
  properties: {
    cmd: {
      type: 'string',
      enum: [ 'start']
    },
    number: {
      type: 'number',
      minimum: 0,
      maximum: 2147483647
    },
    profile: {
      type: 'string',
      minLength: 1,
      maxLength: 128
    }
  },
  additionalProperties: false
});

exports.BurpPayloadChannelStarted = myEnv.Schema.create({
  type: 'object',
  properties: {
    cmd: {
      type: 'string',
      enum: [ 'started']
    },
    number: {
      type: 'number',
      minimum: 0,
      maximum: 2147483647
    }
  },
  additionalProperties: false
});
    

exports.BurpPayloadGreeting = myEnv.Schema.create({
  description: 'greeting payload',
  type: 'object',
  properties: {
    greeting: {
      type: 'object',
      properties: {
        profiles: {
          type: 'array', // well array in this case
          items: [
            {
              type: 'string',
              minLength: 1,
              maxLength: 64
            }
          ],
          uniqueItems: true
        },
        options: {
          type: 'object',
          items: [
            // FIXME don't think this is working as intended, appears not to be checking key/value of objects
            {
              description: 'option key',
              type: 'string',
              enum: [ 'lang']
            },
            {
              type: 'string'
            }
          ]
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
});

exports.BurpFrame = myEnv.Schema.create({
  type: 'object',
  properties: {
    t: { // type
      type: 'string',
      enum: [ 'msg', 'rpy', 'ans', 'err', 'nul' ]
    },
    c: { // channel
      type: 'number',
      minimum: 0,
      maximum: 2147483647
    },
    msgno: {
      type: 'number',
      minimum: 0,
      maximum: 2147483647
    },
    
    more: {
      type: 'string',
      minLength: 1,
      maxLength: 1,
      enum: [ '.', '*' ]
    },
  
    seq: { // sequence number
      type: 'number',
      minimum: 0,
      maximum: 4294967295
    },

    size: { // size
      type: 'number',
      minimum: 0,
      maximum: 2147483647
    },

    ans: { // answer numbers
      type: 'array',
      minimum: 0,
      maximum: 2147483647,
      items: { type: 'number' },
      optional: true
    },
  },
  additionalProperties: false
});


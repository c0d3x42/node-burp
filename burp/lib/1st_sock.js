var events2 = require('eventemitter2');
var inspect = require('sys').inspect;
var util = require('util');
var msgpack = require('msgpack2');
var pack = msgpack.pack;
var unpack = msgpack.unpack;
var logs4js = require('log4js')();

function BurpSock( options )
{
  
  var self = this;
  this.buff = null;
  this.state = 'new';
  this.profiles = {};
  this.profile_counter = 1;
  this.sequence = 0;
  this.next_channel = 1;
  this.system_channel = 0;
  

  this.allowed_states = [ 'new', 'init', 'profiles' ];

  events2.EventEmitter2.call(this, {
    delimiter: '/',
    wildcard: true,
    maxListeners: 10
  });

  console.log( "THIS: " + inspect( self, 1 ) );

  this.on( 'msg', this.emitMsg.bind(this) );
  this.on( 'validate_msg', this.validateMsg.bind(this) );

};

util.inherits(BurpSock, events2.EventEmitter2);


BurpSock.prototype.addProfile = function( profile )
{
  // validate profile
  var next_profile_index = this.profile_counter++;
  this.profiles[next_profile_index] = profile;
};

BurpSock.prototype.startSock = function( sock )
{
  this.socket = sock;
  if( !sock )
  {
    this.emit( 'error', new Error( 'Must have a socket' ) );
    return null;
  }
  this.state = 'init';
  
  console.log( 'profiles = ' + inspect( this.profiles ) );
  this.sendProfiles( );

};

BurpSock.prototype.nextSequence = function()
{
  return this.sequence++;
};

BurpSock.prototype.setState = function( state )
{
  // FSM check in allowed_states
  this.state = state;
};


BurpSock.prototype.sendProfiles = function( )
{
  var profiles = { c: this.system_channel, s: this.nextSequence(), cmd: 'profile', profiles: this.profiles || {} };
  var msg = pack( profiles );
  this.setState( 'profiles_sent' );
  this.socket.write( msg, function()
  {
    this.dataReady();
  });
};



BurpSock.prototype.dataReady()
{
  this.socket.on( 'data', this.emitData.bind(this) );
};


BurpSock.prototype.emitData = function( data )
{
  //console.log( "emitData: " + inspect( data ) );
  if( this.buff )
  {
    var b = new Buffer( this.buff.length + data.length );
    this.buff.copy( b, 0, 0, this.buff.length );
    data.copy(b, this.buff.length, 0, data.length );
    this.buff = b;
  }
  else
  {
    this.buff = data;
  }

  while( this.buff && this.buff.length > 0 )
  {
    var msg = unpack( this.buff );
    if( !msg ) break;

    this.emit('validate_msg', msg );

    if( unpack.bytes_remaining > 0 )
    {
      this.buff = this.buff.slice( this.buff.length - unpack.bytes_remaining, this.buff.length );
    }
    else
    {
      this.buff = null;
    }
  }
};

BurpSock.prototype.validateMsgHeader( msg )
{

};

BurpSock.prototype.emitMsg = function( msg )
{
  console.log( "emitMsg: " + inspect( msg ) );
};

BurpSock.prototype.validateMsg = function( msg )
{
  logger.trace( "validateMsg: " + inspect( msg ) );
  // check the channel number and serial number are at least defined
  if( msg.c == undefined || msg.s == undefined )
  {
    logger.error( "ValidateMsg failed, missing headers" );
    logger.debug( " - msg: " + inspect( msg ) );
  }

};

module.exports = BurpSock;

var events2 = require('eventemitter2');
var inspect = require('sys').inspect;
var util = require('util');
var msgpack = require('msgpack2');
var pack = msgpack.pack;
var unpack = msgpack.unpack;
var BurpChannel = require('./channel');
var FrameSchemas = require('./frame');
var BurpFrame = FrameSchemas.BurpFrame;
var BurpPayloadChannelStart = FrameSchemas.BurpPayloadChannelStart;
var BurpPayloadChannelStarted = FrameSchemas.BurpPayloadChannelStarted;
var BurpPayloadGreeting = FrameSchemas.BurpPayloadGreeting;

var MGMT_CHANNEL = 0;

function BurpSock( options )
{
  
  var self = this;

  if( options.session == undefined || options.mode == undefined || options.alias == undefined )
    throw new Error('BurpSock failed' );

  this.session = options.session;
  this.mode = options.mode;
  this.alias = options.alias;

  this.logger = this.session.logger || function(){};

  this.greetings_state = undefined;

  this.buff = null;
  this.socket = undefined;

  this.next_channel_numbers = { init: 1, listen: 2 };
  this.channels = {};
  this.channels[0] = new BurpChannel( { channel_number: MGMT_CHANNEL, profile: 'MGMT' } );
  this.remote_profiles = {};

  events2.EventEmitter2.call(this, {
    delimiter: '/',
    wildcard: true,
    maxListeners: 10
  });

  this.logger.trace( "THIS: " + inspect( self, 1 ) );

  //this.on( 'msg', this.emitMsg.bind(this) );
  this.on( 'got_greetings', function()
  {
    this.logger.info( "Socket state is ready" );
    self.session.emit( 'ready', self );
  });

  this.on( 'enquepacket', this.enquePacket.bind( this ) );
  this.on( 'greetings/sent', this.dataReady.bind(this) );
  this.on( 'greetings/send', this.startGreetings.bind(this));
  this.on( 'greetings/received', function()
  {
    /*
     * session has now been established
     */
    self.greetings_state = 'exchanged';

    self.logger.trace( 'remote profiles are: ' + inspect( self.remote_profiles ) );

    self.logger.info( 'greetings exchanged, setting up channel0 events' );
    self.on( 'msg/0', self.channel0_msg );
    self.on( 'rpy/0', self.channel0_rpy );
    self.on( 'err/0', self.channel0_err );

    /*
     * notify the session that a burp socket has been established
     */

    self.session.emit( 'established/' + self.alias, self );
  });
};

util.inherits(BurpSock, events2.EventEmitter2);

BurpSock.prototype.isServer = function()
{
  return this.mode == 'server';
};

BurpSock.prototype.isClient = function()
{
  return this.mode == 'client';
};

BurpSock.prototype.start = function( sock )
{
  /*
   * sock is either an accepted socket for a server
   * or a connected socket for a client
   */
  this.socket = sock;
  if( !sock )
  {
    this.emit( 'error', new Error( 'Must have a socket' ) );
    return null;
  }
  this.logger.debug( 'started socket' );
  this.logger.trace( inspect( sock ) );

  this.emit( 'greetings/send' );
 
};

BurpSock.prototype.startGreetings = function()
{ 
  if( this.isServer )
    this.sendServerGreetings();
  else
    this.sendClientGreetings();
};

BurpSock.prototype.nextListeningChannel = function()
{
  var channel = this.next_channel_numbers.listen;
  this.next_channel_numbers.listen += 2;
  return channel;
};

BurpSock.prototype.nextInitiatorChannel = function()
{
  var channel = this.next_channel_numbers.init;
  this.next_channel_numbers.init += 2;
  return channel;
};


BurpSock.prototype.sendServerGreetings = function( )
{
  var self = this;
  var payload = { greeting: { profiles: [], options: [] }};

  var index = undefined;
  for( index in this.session.profiles )
  {
    payload.greeting.profiles.push( this.session.profiles[index] );
  }

  if( this.session.options )
    payload.greeting.options = this.session.options;
  
  this.greetings_state = 'sending';

  this.once( 'rpy/0', self.waitForClientGreetings.bind(self) );

  var frame = this.buildFrameRpy( MGMT_CHANNEL, 0, payload );
  this.writeFrame( frame, function()
  {
    self.greetings_state = 'sent';

    self.logger.debug( 'greetings sent' );
    self.emit( 'greetings/sent' );
  });
  
};

BurpSock.prototype.waitForClientGreetings = function( header, payload )
{
  this.logger.debug( 'Got client greetings' );
  this.logger.trace( inspect( header ) );
  this.logger.trace( inspect( unpack( payload ) ) );
  
  var unpacked_payload = unpack( payload );
  var validation = BurpPayloadGreeting.validate( unpacked_payload );
  if( validation.isError() )
  {
    this.logger.error( validation.getError() );
    this.emit( 'greetings/corrupt' );
  }
  else
  {
    /*
     * now remember the options and profiles that the 
     * other end announced
     */

    var index = unpacked_payload.greeting.profiles.length -1 || -1 ;
    this.logger.debug( 'remote profiles count = ' + index );
    while( index >= 0 )
    {
      this.remote_profiles[index] = unpacked_payload.greeting.profiles[index];
      index--;
    }

    this.emit( 'greetings/received' );
  }
};

BurpSock.prototype.sendClientGreetings = function()
{

};



BurpSock.prototype.buildFrame = function( type, channel, msgno, in_payload )
{

  // possibly wasteful of cpu:
  //var payload_packed_length = pack( payload ).length;
  var payload;
  var payload_length = 0;

  if( Buffer.isBuffer( in_payload ) )
  {
    payload = in_payload;
  }
  else
  {
    payload = pack( in_payload );
  }

  var header = {
    t: type,
    c: channel,
    msgno: msgno,
    more: '.',
    seq: this.channels[channel].nextSeqNumber(),
    size: payload.length,
    ans: []
  };
  var packed_header = pack( header );
  if( ! Buffer.isBuffer( packed_header ) )
  {
    this.logger.fatal( 'packed header is not a Buffer' );
  }

  var b = new Buffer( packed_header.length + payload.length );
  packed_header.copy( b, 0, 0, packed_header.length );
  payload.copy( b, packed_header.length, 0, payload.length );
  
  return b;

};

BurpSock.prototype.buildFrameRpy = function( channel, in_reply_to, payload )
{
  return this.buildFrame( 'rpy', channel, in_reply_to, payload );
};

BurpSock.prototype.buildFrameMsg = function( channel, payload )
{
  var msgno = this.channels[channel].nextMsgNumber();

  return this.buildFrame( 'msg', channel, this.channels[channel].nextMsgNumber(), payload );
};



BurpSock.prototype.writeFrame = function( frame, frame_written_cb )
{
  this.socket.write( frame, frame_written_cb );
};

BurpSock.prototype.enquePacket = function( packet, packet_written_cb )
{
  var self = this;
  var cb = packet_written_cb || function(){ self.logger.debug( 'packet written' ); };
  this.socket.write( packet, packet_written_cb );
};



BurpSock.prototype.dataReady = function()
{
  if( this.socket == undefined )
  {
    this.logger.fatal( 'socket is not actually ready' );
    throw new Error( 'socket not ready' );
  }
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
    var burp_header = unpack( this.buff );
    if( !burp_header ) break;
    this.logger.trace( 'BurpHeader: ' + inspect( burp_header ) );

    var header_length = this.buff.length - unpack.bytes_remaining;
    this.logger.debug( 'header length: ' + header_length );

    var header_validation = BurpFrame.validate( burp_header );
    if( header_validation.isError() ) 
    {
      this.logger.fatal( 'header received but is invalid: ' + inspect( burp_header ) );
      break;
    }

    /* 
     * now check to see if the buffer is big enough to accomodate the header + payload 
     */

    if( unpack.bytes_remaining < burp_header.size )
    {
      this.logger.debug( "Still waiting for some bytes to arrive" );
      break;
    }
    var header_plus_payload_length = header_length + burp_header.size;
    this.logger.trace( 'buff_length = ' + this.buff.length );
    this.logger.trace( 'header_length = ' + header_length );
    this.logger.trace( 'payload_length = ' + burp_header.size );
    this.logger.trace( 'header_plus_payload_length = ' + header_plus_payload_length );

    var payload_buffer = new Buffer( burp_header.size );
    this.buff.copy( payload_buffer, 0, header_length, header_plus_payload_length );
    
    if( this.buff.length - header_plus_payload_length > 0 )
    {
      this.buff = this.buff.slice( this.buff.length - header_plus_payload_length, this.buff.length );
      this.logger.debug( 'socket buffer reset to new length: ' + this.buff.length );
    }
    else
    {
      this.logger.trace( 'socket buffer is empty' );
      this.buff = null;
    }
    this.logger.trace( 'socket emiting new frame with header: ' + inspect( burp_header ) );
    this.logger.trace( 'socket emiting new frame with payload: ' + inspect( unpack( payload_buffer ) ) );

    // emit a message from this channel
    this.emit( [burp_header.t, burp_header.c], burp_header, payload_buffer );
    
  }
};

BurpSock.prototype.emitMsg = function( header, payload )
{
  console.log( "emitMsg: " + inspect( header ) );

  
};


BurpSock.prototype.handleMgtmChannelRpy = function( payload )
{
  if(payload.greeting != undefined )
  {
    this.remote_profiles = payload.greeting;
    this.emit( 'got_greetings' );
    this.logger.trace( "remote profiles: " + inspect( this.remote_profiles ) );
  }
};


/*
 * callbacks for channel 0 messages
 */
BurpSock.prototype.channel0_msg = function( header, payload )
{
  var self = this;
  var validator = undefined;
  var unpacked_payload = unpack( payload );
  if( !unpacked_payload )
  {
    this.logger.error( "failed to unpack channel0 payload" );
    this.logger.trace( inspect( payload ) );
    return null;
  }

  if( unpacked_payload.cmd != undefined )
  {
    switch( unpacked_payload.cmd )
    {
      case 'start':
        validator = BurpPayloadChannelStart.validate( unpacked_payload );
        if( validator.isError() )
        {
          this.logger.error( 'failed to validate payload: ' + validator.getError() );
          return null;
        }

        this.logger.info( 'valid channel start packet received' );
        var channel = new BurpChannel( { channel_number: unpacked_payload.number, profile: unpacked_payload.profile, burp_socket: this } );
        this.channels[unpacked_payload.number] = channel;
        // FIXME notify server channel has been created

        var payload_to_send = { cmd: 'started', number: unpacked_payload.number };
        this.channel0_writeRpy( payload_to_send, header.msgno, function()
        {
          self.logger.debug( 'emiting profile opened: ' + inspect( unpacked_payload ) );
          self.emit( 'profile_opened/' + unpacked_payload.profile, channel );
        });

      break;
    }
  }

  if( validator == undefined )
  {
    this.logger.error( 'no validator for channel0/msg payload' );
    return null;
  }

};

BurpSock.prototype.channel0_rpy = function( header, payload )
{
  var self = this;
  var validator = undefined;

  var unpacked_payload = unpack( payload );
  if( !unpacked_payload )
  {
    this.logger.error( "failed to unpack channel0 payload" );
    this.logger.trace( inspect( payload ) );
    return null;
  }

  if( unpacked_payload.cmd != undefined )
  {
    switch( unpacked_payload.cmd )
    {
      case 'started':
        validator = BurpPayloadChannelStarted.validate( unpacked_payload );
        if( validator.isError() )
        {
          this.logger.error( 'failed to validate payload: ' + validator.getError() );
          return null;
        }

        this.logger.info( 'valid channel started packet received' );

        // channel should already have been created
        var channel = this.channels[unpacked_payload.number] ;
        if( channel == undefined )
        {
          this.logger.fatal( 'received channel started rpy but it not wasn\'t there when we looked' );
        }
        else
        {
          this.logger.debug( 'channel has been created on the other side' );
          channel.emit( 'created' );
        }
      break;
    }
  }

  if( validator == undefined )
  {
    this.logger.error( 'no validator for channel0/rpy payload' );
    return null;
  }

  
};

BurpSock.prototype.channel0_err = function( header, payload )
{
};



BurpSock.prototype.channel0_writeRpy = function( payload, msgno_rpy, cb )
{
  var channel0 = this.channels[0];
  this.logger.trace( 'channel0_writeRpy: ' + inspect( channel0 ) );
  
  return this.channel_send_rpy( channel0, payload, msgno_rpy, cb );
};


BurpSock.prototype.channel_send_rpy = function( channel, payload, msgno_rpy, cb )
{
  return this.channel_send_rpy_common( { channel: channel, msgno_rpy: msgno_rpy }, payload, cb );
};

BurpSock.prototype.channel_send_rpy_common = function( args, in_payload, cb )
{

  var channel = args.channel;
  var msgno_rpy = args.msgno_rpy;
  var channel_number = args.channel.get_number();

  var payload = undefined;
  if( Buffer.isBuffer( in_payload ) )
  {
    payload = in_payload;
  }
  else
  {
    payload = pack( in_payload );
  }

  var header = {
    t: 'rpy',
    c: channel_number,
    msgno: msgno_rpy,
    more: '.',
    seq: this.channels[channel_number].nextSeqNumber(),
    size: payload.length
  };

  var packed_header = pack( header );
  var b = new Buffer( packed_header.length + payload.length );
  packed_header.copy( b, 0, 0, packed_header.length );
  payload.copy( b, packed_header.length, 0, payload.length );

  this.emit( 'enquepacket', b, cb );
};



BurpSock.prototype.channel0_writeMsg = function( payload, msgno )
{
  this.logger.trace( 'channel0_writeMsg: ' + inspect( arguments ) );
  var channel0 = this.channels[0];
  return this.channel_send_msg( channel0, payload, msgno );
};


BurpSock.prototype.channel_send_msg = function( channel, payload, msgno, cb )
{
  
  return this.channel_send_msg_common( { channel: channel, proposed_msgno: undefined, msgno: msgno }, payload, cb );
};

BurpSock.prototype.channel_send_msg_common = function( args, in_payload, cb )
{
  this.logger.trace( 'channel_send_msg_common- ' + inspect( arguments ) );
  var channel = args.channel;
  var msg_no = args.proposed_msgno || args.channel.get_next_msg_no();
  var channel_number = args.channel.get_number();
  var wait_reply = args.wait_reply || null;

  this.logger.trace( 'channel_send_msg_common: ' + inspect( args ) );

  var payload = undefined;
  if( Buffer.isBuffer( in_payload ) )
  {
    payload = in_payload;
  }
  else
  {
    payload = pack( in_payload );
  }


  var header = {
    t: 'msg',
    c: channel_number,
    msgno: msg_no,
    more: '.',
    seq: this.channels[channel_number].nextSeqNumber(),
    size: payload.length
  };

  var packed_header = pack( header );
  var b = new Buffer( packed_header.length + payload.length );
  packed_header.copy( b, 0, 0, packed_header.length );
  payload.copy( b, packed_header.length, 0, payload.length );

  this.emit( 'enquepacket', b, cb );
  
};



BurpSock.prototype.startChannel = function( args )
{
  var self = this;
  var profile = args.profile || undefined;

  for( var index in this.remote_profiles )
  {
    this.logger.debug( 'Checking remote profile: [' + this.remote_profiles[index] + '] availability...' );
    if( this.remote_profiles[index] == profile )
    {
      this.logger.debug( "Profile: [" + profile + "] is supported on the remote side" );

      var channel_number = this.nextInitiatorChannel();
      this.logger.debug( 'channel number chosen: ' + channel_number );

      if( this.channels[channel_number] != undefined )
      {
        this.logger.fatal( 'Channel number: ' + channel_number + ' is already taken' );
        return null;
      }

      var channel = new BurpChannel( { channel_number: channel_number, profile: profile, burp_socket: this } );
      var payload = { cmd: 'start', number: channel_number, profile: profile };
      this.channels[channel_number] = channel;

      this.channel0_writeMsg( payload );

      return this.channels[channel_number];
    }
    else
    {
      this.logger.debug( 'profile: ' + args.profile + ' not found at position: ' + index );
    }
  }
  this.logger.debug( "startChannel completed" );
  return null;
};

BurpSock.prototype.channelNotOpened = function( channel_number )
{
  var msg = pack( { c: this.system_channel, s: this.nextSequence(), e: 'invalid_channel', b: { number: channel_number } } );
  this.socket.write( msg, function()
  {
    this.logger.error( 'client told about invalid channel number: ' + channel_number );
  });
  
};

BurpSock.prototype.new_channel = function( args )
{
  
};


module.exports = BurpSock;

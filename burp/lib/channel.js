
var events2 = require('eventemitter2');
var util = require('util');

function BurpChannel( args )
{
  var self = this;

  this.channel_number = args.channel_number;
  this.profile_name = args.profile;
  if( args.burp_socket != undefined )
  {
    this.burp_socket = args.burp_socket;
  }

  this.sequenceNumber = 0;
  this.messageNumber = 0;
};

util.inherits(BurpChannel, events2.EventEmitter2);

BurpChannel.prototype.nextSeqNumber = function()
{
  this.sequenceNumber++;
  return this.sequenceNumber;
};

BurpChannel.prototype.nextMsgNumber = function()
{
  this.messageNumber++;
  return this.messageNumber;
};

BurpChannel.prototype.get_next_msg_no = function()
{
  // FIXME
  return 0;
};

BurpChannel.prototype.get_number = function()
{
  return this.channel_number;
};


BurpChannel.prototype.sendMsg = function( payload, cb )
{
  this.burp_socket.channel_send_msg( this, payload, 0, cb );
};

module.exports=BurpChannel;


var net = require('net');
var inspect = require('sys').inspect;
var Burp = require('./burp' );

var BurpSession = Burp.BurpSession;


var session = new BurpSession( { lang: 'en' } );
session.addProfile( 'test' );
session.addProfile( 'server' );
session.addProfile( 'demo', function(msg)
{
  
});


session.addListener( { alias: 'local', endpoint: 'tcp://localhost:8000' } );

var on_created = function()
{

};

var on_frame = function()
{

};

var on_close = function()
{

};

session.on( 'established/local', function( burp_socket )
{
  burp_socket.on( 'profile_opened/test', function( channel )
  {
    session.logger.info( 'test channel has been opened' );
    channel.on( 'frame', function( payload )
    {
      session.logger.debug( "received frame on channel: " + inspect( payload ) );
    });
  });

});

session.on( 'ready', function( burp_socket )
{
  var c1 = burp_sock.new_channel( { 
    profile: 'demo', 
    channel: 0, 
    on_created: on_created, 
    on_frame: on_frame,
    on_close: on_close });

  console.log( "Client Connection is ready" );
});


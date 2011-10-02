
var net = require('net');
var inspect = require('sys').inspect;
var BurpSession = require('./burp' ).BurpSession;


var b = new BurpSession( );
b.addProfile( 'test' );
b.addProfile( 'ping' );
b.addProfile( 'demo', function(msg)
{
  
});


b.addConnection( { alias: 'local', endpoint: 'tcp://localhost:8000' } );

b.on( 'established/local', function( burp_socket )
{
  console.log( "local is established" );
  console.log( inspect( burp_socket ) );

  var channel = burp_socket.startChannel( { profile: 'test' } );
  channel.on( 'created', function( )
  {
    b.logger.info( "Channel created" );
    channel.sendMsg( { hello: 'world' }, function()
    {
      b.logger.info( 'message sent' );
    });
  });

  channel.on( 'closed', function()
  {
    b.logger( "Channel closed" );
  });

  channel.on( 'frame', function( frame )
  {
    b.logger.trace( "frame received on channel: " + inspect( frame ) );
  });
});

b.on( 'ready', function( burp_socket )
{
  console.log( "BURP is ready" );
  var channel = burp_socket.startChannel( 'test' );
  channel.on( 'established', function()
  {
    console.log( 'STARTED channel: ' + channel.profile );
  });
});


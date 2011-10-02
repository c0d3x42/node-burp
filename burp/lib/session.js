var events2 = require('eventemitter2');
var inspect = require('sys').inspect;
var util = require('util');
var net = require('net');
var msgpack = require('msgpack2');
var pack = msgpack.pack;
var unpack = msgpack.unpack;
var log4js = require('log4js');
var BurpSock = require('./sock');

function BurpSession( options )
{
  
  var self = this;
  this.state = 'new';
  this.profiles = {};
  this.profile_counter = 1;
  this.sockets = { listening: {}, connecting: {} };
  this.burp_sockets = { listening: {}, connecting: {} };

  this.options = options || {};

  this.allowed_states = [ 'new', 'init', 'profiles' ];

  events2.EventEmitter2.call(this, {
    delimiter: '/',
    wildcard: true,
    maxListeners: 10
  });

  this.logger = log4js.getLogger( 'Burp' );
  this.logger.setLevel( this.options.loglevel || 'TRACE' );

  this.logger.trace( "THIS: " + inspect( self, 1 ) );
  

};

util.inherits(BurpSession, events2.EventEmitter2);


BurpSession.prototype.addProfile = function( profile )
{
  // validate profile
  var next_profile_index = this.profile_counter++;
  this.profiles[next_profile_index] = profile;
};

BurpSession.prototype.startServerSock = function( sock )
{
  return this.startSock( 2, sock );
};


BurpSession.prototype.startClientSock = function( sock )
{
  return this.startSock( 1, sock );
};


BurpSession.prototype.startSock = function( intial_channel, sock )
{
  var self = this;
  if( !sock )
  {
    this.logger.error( "startSock called without a socket: " + inspect( sock ) );
    this.emit( 'error', new Error( 'Must have a socket' ) );
    return null;
  }
  else
  {
    var burp_sock = new BurpSock( this, { initial_channel: intial_channel } );
    // keep a reference to teh burp sock
    this.burp_sockets.push( burp_sock );

    burp_sock.on( 'established', function()
    {
      self.emit( 'established' );
    });

    burp_sock.on( 'ready', function()
    {
      // profiles have been exchanged
      self.state = 'ready';

      // notify the caller that the BurpSock has been setup
      self.emit( self.state, burp_sock );
    });
    burp_sock.start( sock );
  }
};

BurpSession.prototype.parseEndpoint = function( endpoint )
{
  if( endpoint == undefined )
  {
    return null;
  }
  else if( typeof endpoint != 'string' )
  {
    this.logger.debug( 'addListener: ' + inspect( endpoint ) );
    this.emit( 'error', new Error( 'endoint is recognised' ) );
    return null;
  }
  else
  {
    var endpoint_matches = undefined;
    if( endpoint_matches = endpoint.match( /tcp:\/\/(\w+):(\d+)/ ) )
    {
      var ep = {};
      ep.protocol = 'tcp';
      ep.hostname = endpoint_matches[1];
      ep.port_number = endpoint_matches[2];
      this.logger.trace( 'EP: ' + inspect( ep ) );
      return ep;
    }
    else
    {
      this.logger.error( 'Failed to parse endpoint: ' + endpoint );
      this.emit( 'error', new Error( 'endpoint parse failure' ) );
      return null;
    }
  }
};

BurpSession.prototype.checkEndpointAlias = function( style, alias )
{
  if(!( style == 'listening' || style == 'connecting' ) )
  {
    this.logger.error( 'incorrect style: ' + style );
    return null;
  }

  if( this.sockets[style][alias] != undefined )
  {
    this.logger.error( style + 'alias: ' + alias + ' is already taken' );
    return null;
  }
  

  if( this.burp_sockets[style][alias] != undefined )
  {
    this.logger.error( style + 'burp alias: ' + alias + ' is already taken' );
    return null;
  }

  return alias;

};

BurpSession.prototype.addListener = function( args )
{

  var self = this;
  var alias = args.alias || undefined;
  var endpoint = args.endpoint || undefined;

  var ep = this.parseEndpoint( endpoint );
  if( ep == null ) return null;

  if( this.checkEndpointAlias( 'listening', alias ) == null )
    return null;


  var socket = net.createServer( function( accepted_socket )
  {
    self.logger.trace( "accepted client connection: " + inspect( accepted_socket ) );
    var burp_sock = new BurpSock( { session: self, mode: 'server', alias: alias } );

    self.burp_sockets.listening[alias] = burp_sock;
    self.burp_sockets.listening[alias].emit( 'accepted/' + alias );

    self.emit( 'accepted/' + alias );

    burp_sock.start( accepted_socket );
  });
  socket.on( 'error', function( err )
  {
    self.logger.error( "Server error" );
    self.emit( 'error', new Error( err ) );
  });

  socket.listen( ep.port_number, ep.hostname, function()
  {
    self.sockets.listening[alias] = socket;
    self.emit( 'listening/' + alias );
  } );
};

BurpSession.prototype.addConnection = function( args )
{
  var self = this;

  var alias = args.alias || undefined;
  var endpoint = args.endpoint || undefined;

  var ep = this.parseEndpoint( args.endpoint );
  if( ep == null ) return null;

  if( this.checkEndpointAlias( 'connecting', alias ) == null )
    return null;


  var socket = net.createConnection( ep.port_number, ep.hostname );

  socket.on( 'error', function( err )
  {
    self.logger.error( 'Client connection failed: ' + inspect( err ) );
    self.emit( 'error', new Error( 'Failed to connect client' ) );
  });
  socket.on( 'connect', function( )
  {
    self.sockets.connecting[alias] = socket;
    self.logger.trace( 'Client connected: ' + inspect( socket ) );

    self.burp_sockets.connecting[alias] = new BurpSock( { session: self, mode: 'client', alias: alias } );
    self.sockets.connecting[alias] = socket;
    self.burp_sockets.connecting[alias].start( socket );
    
  });
};

BurpSession.prototype.startChannel = function( profile_name )
{
  
};


module.exports = BurpSession;

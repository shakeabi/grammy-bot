const Discord = require("discord.js");
const { prefix, token } = require("./config.json");
const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const JSONdb = require('simple-json-db');
const db = new JSONdb('./db.json', {asyncWrite: true});

const client = new Discord.Client();

const queue = new Map();

client.once("ready", () => {
  console.log("Ready!");
});

client.once("reconnecting", () => {
  console.log("Reconnecting!");
});

client.once("disconnect", () => {
  console.log("Disconnect!");
});

client.on("message", async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const serverQueue = queue.get(message.guild.id);
  validateSettings = true
  if(db.has(message.guild.id)){
    settings = db.get(message.guild.id)
    if(settings['textChannelId']!=`<#${message.channel.id}>`)
      validateSettings = false
  }

  if(validateSettings)
    if (message.content.startsWith(`${prefix}play`)) {
      execute(message, serverQueue);
      return;
    } else if (message.content.startsWith(`${prefix}skip`)) {
      skip(message, serverQueue);
      return;
    } else if (message.content.startsWith(`${prefix}stop`)) {
      stop(message, serverQueue);
      return;
    } else if (message.content.startsWith(`${prefix}queue`)) {
      sendQueueStatus(message, serverQueue);
      return;
    } else if (message.content.startsWith(`${prefix}remove`)) {
      removeFromQueue(message, serverQueue);
      return;
    } else if (message.content.startsWith(`${prefix}setup`)) {
      setup(message);
      return;
    } else {
      message.channel.send("You need to enter a valid command!");
    }
});

async function execute(message, serverQueue) {
  const args = message.content.split(" ");
  args.shift()
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel)
    return message.channel.send(
      "You need to be in a voice channel to play music!"
    );
  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
    return message.channel.send(
      "I need the permissions to join and speak in your voice channel!"
    );
  }

  let songInfo = {}
  try{
      const searchString = args.join(" ")
      const filters1 = await ytsr.getFilters(searchString);
      const filter1 = filters1.get('Type').get('Video');
      const searchResults = await ytsr(filter1.url, {pages: 1});
      // console.log(searchResults)
      let top_result = {};
      if(searchResults['items'].length)
        top_result = searchResults['items'][0]
      else
        throw Error("No results found")
      // console.log(top_result)
      songInfo = await ytdl.getInfo(top_result.url);
  } catch(err){
      console.log(err);
      return message.channel.send("Sry song not found!")
  }
  const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
   };

  if (!serverQueue) {
    const queueContract = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    };

    queue.set(message.guild.id, queueContract);

    queueContract.songs.push(song);

    try {
      var connection = await voiceChannel.join();
      queueContract.connection = connection;
      play(message.guild, queueContract.songs[0]);
    } catch (err) {
      console.log(err);
      queue.delete(message.guild.id);
      return message.channel.send(err);
    }
  } else {
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  }
}

function skip(message, serverQueue) {
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to skip the music!"
    );
  if (!serverQueue)
    return message.channel.send("There is no song that I could skip!");
  serverQueue.connection.dispatcher.end();
}

function stop(message, serverQueue) {
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to stop the music!"
    );
    
  if (!serverQueue)
    return message.channel.send("There is no song that I could stop!");
    
  serverQueue.songs = [];
  serverQueue.connection.dispatcher.end();
}

function play(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const dispatcher = serverQueue.connection
    .play(ytdl(song.url, { quality: 'lowest' }))
    .on("finish", () => {
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    })
    .on("error", error => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
  serverQueue.textChannel.send(`Started playing: **${song.title}**`);
}

function sendQueueStatus(message, serverQueue){
  let queueString=`**Queue** [${serverQueue.songs.length}]\n`
  if(serverQueue && serverQueue.songs.length){
    queueString += serverQueue.songs.map((e,i) => {
      if(i==0)
        return `*) ${e.title}`
      else
        return `${i}) ${e.title}`
    }).join("\n")
    return message.channel.send(queueString);
  } else {
    return message.channel.send("No active queue");
  }
}

function removeFromQueue(message, serverQueue){
  if(serverQueue && serverQueue.songs.length){
    const args = message.content.split(" ");
    const index = parseInt(args[1]);
    if(serverQueue.songs[index]){
      const removedSong = serverQueue.songs.splice(index,1);
      return message.channel.send(`Removed ${removedSong[0].title}`)
    } else
      return message.channel.send(`Request index doesnt exist. Try !queue.`)
  } else {    
    return message.channel.send("No active queue.");
  }
}

function setup(message){
  let data = {};
  if(db.has(message.guild.id))
    data = db.get(message.guild.id);
  
  const args = message.content.split(" ");
  args.shift();

  if(!args.length){
    if(db.has(message.guild.id))
      return message.channel.send(JSON.stringify(db.get(message.guild.id), null, 2));
    else
      return message.channel.send("Channel hasn't been configured yet!")
  }

  if(args[0] == "textChannel" && /^(<#[0-9]+>)$/.test(args[1])){
    data['textChannelId'] = args[1]
    data['textChannel'] = message.cleanContent.split(" ")[2]
    db.set(message.guild.id, data)
    message.channel.send("`textChannel` has been successfully set!")
  }

}

client.login(token);
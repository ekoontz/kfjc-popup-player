// -------- Script Globals ----------------------------------------------------

// Status of player state machine. Starts at 'uninitialized'. 'fatal_error' is a
// terminal end state. Once loaded OK then goes to 'ready'. If playing it will
// be 'playing', if paused it will go back to 'ready' state. If the buffering
// check detects it is buffering it will be 'buffering.'
var g_player_state = 'uninitialized';
var g_player_buffer_spinner_number = 0;
var g_player_last_buffering_check = null;
var g_player_last_playhead = null;
var g_player_current_sound_id = null;
var g_player_render_vu = false;

var player_high_quality_enabled = true;
var player_display_state;

// -------- Initialization ----------------------------------------------------

// soundManager.setup() needs to be called _before_ DOM Ready, so call now.
soundManager.setup({
//  debugFlash: true,
//  debugMode: true,
  flashVersion: 9,  // only flash 9 can play AAC or return peak values for VU
  onready: onSoundManagerReady,
  ontimeout: onSoundManagerTimeout,
  preferFlash: false,
  url: 'https://cdnjs.cloudflare.com/ajax/libs/soundmanager2/2.97a.20150601/swf/'
});

// -------- SoundManager State ------------------------------------------------

function onSoundManagerReady() {
  g_player_state = 'ready';
  updatePlayStopButtonState();
  var volume = getCurrentVolume();
  soundManager.createSound({
    autoPlay: false,
    id: 'kfjc-mp3-high',
    multiShot: false,
    onfailure: onSoundFailure,
    onfinish: onSoundFinish,
    url: 'https://netcast6.kfjc.org/;stream',
    volume: volume,
  });
  soundManager.createSound({
    autoPlay: false,
    id: 'kfjc-mp3-low',
    duration: 0,
    multiShot: false,
    onfailure: onSoundFailure,
    onfinish: onSoundFinish,
    url: 'https://netcast4.kfjc.org:8974/;stream',
    volume: volume,
  });

  // SM should actually make the determination to play the streams with Flash
  // before we allow the user to see the VU meter button.
  if (!soundManager.getSoundById('kfjc-mp3-low').isHTML5) {
    $("#popup-show-vu-button-show-hide-container").attr('style', '');
  }

  // Steal focus back from SM elements.
  $("#popup-play-pause-button").focus();
}

function loadArchive(playlistNum) {
  deleteArchiveSounds();
  var hours = kfjc.showList[playlistNum];
  for (var i = 0; i < hours.length; i++) {
    // TODO: extract out "archive" const
    createArchiveSound("archive"+i, hours[i].url);
  }
  kfjc.nowPlayingMetadata = metadataFromArchive(playlistNum);
  seekOverShow(kfjc.startPlaybackPosition);
}

function deleteArchiveSounds() {
  // Create list of sounds to destroy so as not to modify
  // soundManager.soundIDs during iteration.
  var destroySounds = []
  $.each(soundManager.soundIDs, function(index, soundId) {
    if (soundId != undefined && soundId.startsWith("archive")) {
      destroySounds.push(soundId);
    }
  });
  $.each(destroySounds, function(index, soundId) {
    soundManager.destroySound(soundId);
  });
}

function createArchiveSound(id, url) {
  soundManager.createSound({
    autoPlay: false,
    id: id,
    multiShot: false,
    onfailure: onSoundFailure,
    onfinish: onSoundFinish,
    url: url,
    volume: getCurrentVolume(),
  });
}

function seekOverShow(seekToMillis) {
  var bounds = kfjc.selectedShowTime.bounds;
  for (var i = 0; i < bounds.length; i++) {
    if (seekToMillis <= bounds[i]) {
      //seek to adjusted position
      var thisSegmentStart = (i == 0) ? 0 : bounds[i-1];
      var extraSeek = (i == 0) ? 0 : kfjc.showList[kfjc.selectedShowMetadata.id][i].padding_ms;
      var localSeekTo = seekToMillis - thisSegmentStart + extraSeek;
      soundManager.stopAll();
      soundManager.unload(g_player_current_sound_id);
      g_player_current_sound_id = "archive" + i;
      soundManager.play(g_player_current_sound_id, {
        position: localSeekTo,
        onfinish: onSoundFinish
      });
      kfjc.nowPlayingArchiveIndex = i;
      startSeekUiUpdate();
      return;
    }
  }
  updatePlayStopButtonState();
}

function startSeekUiUpdate() {
  stopSeekUiUpdate();
  seekUiUpdate();
  kfjc.seekIntervalId = setInterval(seekUiUpdate, 1000);
}

function seekUiUpdate(opt_position) {
  // TODO: boundary conditions
  var position = opt_position != undefined ? opt_position : getPlayerPosition();
  if (kfjc.archiveIsSliding) {
    return;
  }
  $("#popup-seek-slider").val(position);
  $("#popup-seek-time").text(positionFormat(position));
}

function positionFormat(p) {
  // Use either ceil or floor, but not round, for best results updating the
  // display every ~1sec.
  var pos = Math.ceil(p / 1000) * 1000;
  if (! isSelectedShortArchive()) {
    pos -= 5 * 60 * 1000;         // TODO: don't hardcode this.
  }
  var isNegativeTime = (pos < 0);
  var prepend = "";
  if (isNegativeTime) {
    pos = Math.abs(pos);
    prepend = "-";
  }
  d = moment.utc(pos); 
  return prepend + d.format("H:mm:ss");
}

function getPlayerPosition() {
  if (kfjc.nowPlayingMetadata.id == 0) {
    return 0;
  }
  var thisHourIndex = kfjc.nowPlayingArchiveIndex;
  var segmentOffset = (thisHourIndex == 0) ? 0 : kfjc.selectedShowTime.bounds[thisHourIndex - 1];
  var extra = (thisHourIndex == 0) ? 0 : kfjc.showList[kfjc.nowPlayingMetadata.id][thisHourIndex].padding_ms;
  var playhead = soundManager.getSoundById(g_player_current_sound_id).position
  return playhead + segmentOffset - extra;
}

function stopSeekUiUpdate() {
  clearInterval(kfjc.seekIntervalId);
}

// Called when SM2 has given up trying to play a sound.
function onSoundFailure() {
  //TODO: actually display error.
  displayError('Lost connection to KFJC audio server!');
  g_player_state = 'ready';
  updatePlayStopButtonState();
}

function onSoundFinish() {
  var nextSoundIndex = kfjc.nowPlayingArchiveIndex + 1;
  var nextSoundId = "archive" + nextSoundIndex;
  if (soundManager.getSoundById(nextSoundId)) {
    soundManager.stopAll();
    soundManager.play(nextSoundId, {
      position: isShortArchivePlaying() ? 0 : 10 * 60 * 1000, // TODO: don't hardcode
      onfinish: onSoundFinish
    });
    kfjc.nowPlayingArchiveIndex++;
    g_player_current_sound_id = nextSoundId;
  } else {
    stopPlaying();
    updatePlayStopButtonState();
  }
}

function onSoundManagerTimeout(status) {
  g_player_state = 'fatal_error';
  updatePlayStopButtonState();
  displayError("Error loading player.");
}

function startPlaying() {
  if (kfjc.selectedShowMetadata.id == 0) {
    g_player_current_sound_id = player_high_quality_enabled ? 'kfjc-mp3-high' : 'kfjc-mp3-low';
    kfjc.nowPlayingMetadata = kfjc.livestreamMetadata;
  } else {
    loadArchive(kfjc.selectedShowMetadata.id);
  }
  soundManager.setVolume(g_player_current_sound_id, getCurrentVolume());
  soundManager.play(g_player_current_sound_id);
  startReport30s();
  g_player_state = 'playing';
}

function stepBackward() {
    var seekOverMs = getPlayerPosition();
    if (seekOverMs != undefined) {
	console.info("seeking backwards to: " + seekOverMs);
	seekOverShow(Math.max(0,seekOverMs-10000));
    } else {
	console.info("user wants to stepBackward() but we have not yet started playing yet: start playing now.");
	startPlaying();
    }
}

function stepForward() {
    var seekOverMs = getPlayerPosition();
    if (seekOverMs != undefined) {
	console.info("seeking forward to: " + seekOverMs);
	seekOverShow(seekOverMs+10000);
    } else {
	console.info("user wants to stepForward() but we have not yet started playing yet.");
	startPlaying();
    }
}

function stopPlaying() {
  kfjc.startPlaybackPosition = getPlayerPosition();
  soundManager.stopAll();
  soundManager.unload(g_player_current_sound_id);
  g_player_current_sound_id = null;
  g_player_state = 'ready';
  stopSeekUiUpdate();
  stopReport30s();
  kfjc.nowPlayingMetadata = {};
}

function checkForBuffering() {
  if (g_player_state == 'playing' || g_player_state == 'buffering') {
    var now = new Date();
    var playhead =
        soundManager.getSoundById(g_player_current_sound_id).position;
    if (g_player_last_buffering_check != null &&
        g_player_last_playhead != null) {
      var wall_clock_diff = now - g_player_last_buffering_check;
      var audio_diff = playhead - g_player_last_playhead;
      // Treat a difference of over 50% in playhead to wallclock as buffering.
      if (audio_diff < wall_clock_diff * 0.5) {
        g_player_state = 'buffering'
        updatePlayStopButtonState();
        g_player_buffer_spinner_number =
            (g_player_buffer_spinner_number + 1) % 4;
      } else {
        g_player_state = 'playing';
        g_player_buffer_spinner_number = 0;
        updatePlayStopButtonState();
      }
    }
    g_player_last_buffering_check = now;
    g_player_last_playhead = playhead;
  } else {
    g_player_last_buffering_check = null;
    g_player_last_playhead = null;
  }
}


// -------- UI Manipulation ---------------------------------------------------

function displayError(errorString) {
  $("#popup-lower-controls").addClass('hidden');
  $("#popup-error-message").removeClass('hidden');
}

function hideAllPlayStopButtons() {
  $("#popup-play-button").hide();
  $("#popup-stop-button").hide();
  $("#popup-loading-button").hide();
}

function updatePlayStopButtonState() {
  if (player_display_state == g_player_state) {
    return;
  }
  player_display_state = g_player_state;
  if (g_player_state == 'uninitialized') {
    hideAllPlayStopButtons();
    $("#popup-loading-button").show();
  } else if (g_player_state == 'ready') {
    hideAllPlayStopButtons();
    $("#popup-play-button").show();
  } else if (g_player_state == 'fatal_error') {
    //TODO: disable play button
  } else if (g_player_state == 'buffering') {
    //TODO: consider showing buffering state
  } else if (g_player_state == 'playing') {
    hideAllPlayStopButtons();
    $("#popup-stop-button").show();
  }
}

// Returns the volume setting on the slider, or 1 if the Mute is pressed.
function getCurrentVolume() {
  return $("#popup-volume-slider").val();
}

function isPlaying() {
  return g_player_state == 'playing';
}

// -------- UI Events ---------------------------------------------------------

function onPlayButtonClicked() {
  if (g_player_state == 'ready') {
    startPlaying();
  }
  updatePlayStopButtonState();
}

function onStepBackwardClicked() {
  console.info("User clicked on step-backward.");
    if (g_player_state == 'playing') {
    stepBackward();
  }
}

function onStepForwardClicked() {
  console.info("User clicked on step-forward.");
    if (g_player_state == 'playing') {
    stepForward();
  }
}

function onStopButtonClicked() {
  if (g_player_state == 'playing' || g_player_state == 'buffering') {
    stopPlaying();
  }
  updatePlayStopButtonState();
};

function onVolumeChange() {
  if (g_player_state == 'playing' || g_player_state == 'buffering') {
    soundManager.setVolume(g_player_current_sound_id, getCurrentVolume());
  }
}

function onSignalQualityClicked() {
  player_high_quality_enabled = !player_high_quality_enabled;
  if (player_high_quality_enabled) {
    $("#popup-hq-button").text('HQ');
  } else {
    $("#popup-hq-button").text('LQ');
  }

  // Stop and re-start with the new quality level if we are currently playing.
  if (g_player_state == 'playing' || g_player_state == 'buffering') {
    stopPlaying();
    startPlaying();
  }
}

/*
 *  Namespace for popup player UI variables.
 */ 
var kfjc = kfjc || {
  archiveIsSliding: false,
  showList: [],
  nowPlayingArchiveIndex: 0,
  selectedShowTime: 0,
  startPlaybackPosition: 0,
  livestreamMetadata: {
    id: 0
  },
  nowPlayingMetadata: {},
  selectedShowMetadata: {
    id: 0
  }
};

/*
 * Convenience functions to determine if this show has 60- or 70-minute archives.
 */
function isSelectedShortArchive() {
  if (kfjc.selectedShowMetadata.id == 0) {
    return true;
  }
  return kfjc.selectedShowMetadata.id > 54940;
}
function isShortArchivePlaying() {
  if (kfjc.nowPlayingMetadata.id == 0) {
    return true;
  }
  return kfjc.nowPlayingMetadata.id > 54940;
}

/*
 *  Main entry point once page is loaded.
 */ 
$(document).ready(function() {
  loadArchives(parseHashNav);
  initializeUIElements();
  startMetadataUpdates();
  startBufferingUpdates();
});

// -------- UI Backbone: Initialize, Invalidate and Resize--------------------------------------

function initializeUIElements() {
  startUpdateBackground();

  // Play-Pause button starts out disabled until SoundManager reports ready.
  $("#nav-playlist").click(togglePlaylist);
  $("#popup-play-button").click(onPlayButtonClicked);
  $("#popup-step-forward").click(onStepForwardClicked);
  $("#popup-stop-button").click(onStopButtonClicked);
  $("#popup-hq-button").click(onSignalQualityClicked);
  $("#popup-volume-slider").on("input change", onVolumeChange);
  $("#popup-volume").hover(showVolume, hideVolume);
  $("#popup-volume-button").click(showVolume);
  $("#popup-play-archive-button").click(playThisInstead);
  $("#popup-seek-slider").on("change", function() {
    if (isPlaying()) {
      seekOverShow($("#popup-seek-slider").val());
    } else {
      kfjc.startPlaybackPosition = $("#popup-seek-slider").val();
    }
  });
  $("#popup-now-playing-overlay").click(function() {
    loadShow(kfjc.nowPlayingMetadata.id);
  });
  $("#popup-seek-slider").on('mousedown touchstart', function() {
    kfjc.archiveIsSliding = true;
  });
  $("#popup-seek-slider").on('input', function() {
    var val = $("#popup-seek-slider").val();
    $("#popup-seek-time").text(positionFormat(val));
  });
  $("#popup-seek-slider").on('mouseup touchend', function() {
    kfjc.archiveIsSliding = false;
  });
  $("#burger-bar").on("open.offcanvas", function() {
    loadArchives();
  });
  $(window).resize(function() {
    resize();
  });

  window.onhashchange = parseHashNav;
  updatePlayStopButtonState();
}

function invalidateUi() {
  $(".now-playing-dj").text(kfjc.nowPlayingMetadata.airName);
  $(".current-live-dj").text(kfjc.livestreamMetadata.airName);

  var isSomethingElseDisplayed = false;

  if (kfjc.selectedShowMetadata.missingAudio) {
    $("#popup-lower-controls").hide();
    if (!kfjc.selectedShowMetadata.airName) {
      updatePlaylist();
      showPlaylist();
    }
    resize();
    return;
  } else {
    $("#popup-lower-controls").show();
  }

  if (isPlaying() && kfjc.selectedShowMetadata.id != kfjc.nowPlayingMetadata.id) {
    isSomethingElseDisplayed = true;
    $("#popup-now-playing-overlay").show();
    $("#popup-play-archive").show();
    $("#popup-controls").hide();
  } else {
    $("#popup-now-playing-overlay").hide();
    $("#popup-play-archive").hide();
    $("#popup-seek").show();
    $("#popup-controls").show();
  }

  if (kfjc.selectedShowMetadata.id == 0) {
    $("#popup-now-playing").html(kfjc.livestreamMetadata.nowPlayingText);
    $("#popup-selected-dj").text(kfjc.livestreamMetadata.airName);
    $(".archive-controls").hide();
    $(".live-controls").show();
  } else {
    $("#popup-now-playing").text(kfjc.selectedShowMetadata.nowPlayingText);
    $("#popup-selected-dj").text(kfjc.selectedShowMetadata.airName);
    $("#popup-seek-slider").attr("max", kfjc.selectedShowTime.total);
    $(".live-controls").hide();
    if (!isSomethingElseDisplayed) {
      $(".archive-controls").show();
    } else {
      $(".archive-controls").hide();
    }
  }

  resize();
  updatePlaylist();
}

function resize() {
  var a = $("#popup-lower-controls").is(":visible") ? $("#popup-lower-controls").height() : 0;
  var b = parseInt($("#popup-upper-margin").css("margin-top"));
  var c = parseInt($("#popup-upper-margin").css("margin-bottom"));
  var d = $("#popup-upper-info").outerHeight();
  var e = $("#popup-now-playing-overlay").is(":visible") ? $("#popup-now-playing-overlay").outerHeight() : 0;

  var playlistHeight = $(window).height() - a - b - c - d - e - 2;
  $("#playlist").height(playlistHeight);

  var aa = $("#burger-header").outerHeight();
  var burgerBodyHeight = $(window).height() - aa - 48;
  $("#burger-body").height(burgerBodyHeight);
}

function startMetadataUpdates() {
  updateMetadata();
  setInterval(updateMetadata, 30000);
}

function startBufferingUpdates() {
  setInterval(checkForBuffering, 500);
}

// -------- AJAX Fetchers and callbacks --------------------------------------------------

function loadArchives(opt_callback) {
  $.getJSON(kfjc_base_url + "/api/archives.php", function(res) {
    kfjc.showList = buildShowList(res);
    var showListTemplateData = buildShowListTemplateData(kfjc.showList);
    renderShowList(showListTemplateData);
    if (opt_callback) {
      opt_callback();
    }
  });
}

function updateMetadata() {
  $.ajax({
    url: kfjc_base_url + '/api/playlists',
    dataType: 'json',
    success: setMetadata,
    cache: false,
    error: updateMetadataFailed
  });
}

function setMetadata(data, textStatus, jqXHR) {
  var liveShow = data.show_info;
  var livePlaylist = data.playlist;
  var liveTrack = livePlaylist[livePlaylist.length - 1];

  var nowPlayingText = "";
    if (liveTrack.artist && liveTrack.track_title) {
      nowPlayingText = liveTrack.artist + " &ndash; " + liveTrack.track_title;
    } else if (liveTrack.artist) {
      nowPlayingText = liveTrack.artist;
    } else if (liveTrack.track_title) {
      nowPlayingText = liveTrack.track_title;
    }
  kfjc.livestreamMetadata = {
    id: 0,
    airName: (liveShow && liveShow.air_name) ? liveShow.air_name : 'George Foothill',
    nowPlayingText: nowPlayingText
  };
  invalidateUi();
}

function updateMetadataFailed() {
  $("#popup-now-playing-track").text('');
  $("#popup-now-playing-artist").text('');
  $("#popup-current-dj").text('George Foothill');
  invalidateUi();
}

function startUpdateBackground() {
  $.ajax({
    url: kfjc_base_url + '/api/resources.json',
    dataType: 'json',
    success: onUpdateBackground,
    cache: false
  });
  window.setTimeout(startUpdateBackground, getMillisUntilNextHour());
}

function onUpdateBackground(data, textStatus, jqXHR) {
  if (data.drawables.backgrounds) {
    var backgrounds = data.drawables.backgrounds;
    var date = new Date();
    var hour = date.getHours();
    $("body").css('background-image', 'url(' + backgrounds[hour] + ')');
  }
}

function updatePlaylist() {
  var playlistId = kfjc.selectedShowMetadata.id;

  $.ajax({
    url: kfjc_base_url + '/api/playlists?i=' + playlistId,
    dataType: 'json',
    success: updatePlaylistCallback,
    cache: false,
    error: updateMetadataFailed
  });
}

function updatePlaylistCallback(data, textStatus, jqXHR) {
  $.each(data.playlist, function(_, track) {
    if (track.time_played) {
      track.time_format = playlistTimeFormat(moment(track.time_played * 1000));
    } else {
      track.time_format = "";
    }
  });
  if (!data.show_info) {
    data.show_info = {
      air_name: "George Foothill",
      start_time_format: ""
    }
  }
  if (data.show_info.start_time) {
    data.show_info.start_time_format = showTimeFormat(roundUpHour(data.show_info.start_time));
  }
  if (kfjc.selectedShowMetadata.missingAudio) {
    // It's also missing show data which should be populated from playlist.
    kfjc.selectedShowMetadata.airName = data.show_info.air_name;
    kfjc.selectedShowMetadata.nowPlayingText = data.show_info.start_time_format;
    $("#popup-now-playing").text(kfjc.selectedShowMetadata.nowPlayingText);
    $("#popup-selected-dj").text(kfjc.selectedShowMetadata.airName);
  }

  var playlistTemplate = doT.template($('#modalPlaylistTemplate').text());
  $('#playlist').html(playlistTemplate(data));
}

function startReport30s() {
  kfjc.reportIntervalId = setInterval(report30s, 30000);
}

function stopReport30s() {
  clearInterval(kfjc.reportIntervalId);
}

function report30s() {
  if (!isPlaying() || kfjc.nowPlayingMetadata.id == undefined) {
    return;
  }
  var data = {
    "type": "PLAYER_30S",
    "msg": "showId:" + kfjc.nowPlayingMetadata.id
  }
  $.post(kfjc_base_url + "/api/metrics/report.php", data);
}

// -------- Unsorted stuff --------------------------------------------------
/*
 *  Consumes JSON archive list from kfjc.org/api/archives.php
 *  Produces map of { playlist_num: [Array of hourly chunks] }
 */
function buildShowList(archives) {
  var shows = {}

  $.each(archives, function(i, archive) {
    if (! shows[archive.playlist_num]) {
      shows[archive.playlist_num] = [];
    }
    shows[archive.playlist_num].unshift(archive)
  });

  return shows;
}

/*
 *  Consumes map of { playlist_num: [Array of hourly chunks] }
 *  Produces { shows: [Array of show template data]}
 */
function buildShowListTemplateData(showList) {
  var showTemplateData = {
    shows: []
  }

  $.each(showList, function(i, show) {
    // Round to the top of the hour by adding 30mins and taking the start of that hour.

    var startTime = roundUpHour(show[0].start_time);
    var timeDayFormat = startTime.tz('America/Los_Angeles').format("hA dddd");
    var dateFormat = startTime.tz('America/Los_Angeles').format("Do MMMM YYYY");

    if (show[0].playlist_num != 0) {
      showTemplateData.shows.push({
        djName: show[0].air_name,
        timeDayFormat: timeDayFormat,
        dateFormat: dateFormat,
        playlist_num: show[0].playlist_num
      });
    }
  });

  showTemplateData.shows.reverse();
  return showTemplateData;
}

/*
 *  Renders the list of shows from the 2-week archive.
 */
function renderShowList(showTemplateData) {
  var showTemplate = doT.template($('#showTemplate').text());

  // Render the books using the template
  $("#archive-list").empty();
  $("#archive-list").append(showTemplate(showTemplateData));
}

/*
 * Loads UI to reflect selected show.
 * playlistNum = 0 refers to the live stream.
 */
function loadShow(playlistNum, positionMillis) {
  if (playlistNum != 0) {
    if (playlistNum in kfjc.showList) {
      kfjc.selectedShowTime = calculateShowTime(playlistNum);
      kfjc.selectedShowMetadata = metadataFromArchive(playlistNum);
    } else {
      kfjc.selectedShowMetadata = {id: playlistNum, missingAudio: true}
    }
    var hours = kfjc.showList[playlistNum];
    kfjc.startPlaybackPosition = positionMillis ? positionMillis : hours[0].padding_ms;
  } else {
    kfjc.selectedShowMetadata = kfjc.livestreamMetadata;
  }
  invalidateUi();
}

function metadataFromArchive(playlistNum) {
  var hours = kfjc.showList[playlistNum];
  var startTime = roundUpHour(hours[0].start_time);
  var timeDayFormat = startTime.tz('America/Los_Angeles').format("hA, dddd Do MMMM YYYY");
  return {
    id: playlistNum,
    airName: hours[0].air_name ? hours[0].air_name : 'George Foothill',
    nowPlayingText: timeDayFormat
  };
}

function togglePlaylist() {
  if ( $('#upper-slide-container').is(":visible")) {
    hidePlaylist();
  } else {
    showPlaylist();
  }
}

function showPlaylist() {
  $("#nav-playlist-icon").addClass("flip-x");
  if (! $('#upper-slide-container').is(":visible")) {
    $('#upper-slide-container').show(0, function() {
      $('#playlist').slideDown('fast');
    });
  }
}

function hidePlaylist() {
  $("#nav-playlist-icon").removeClass("flip-x");
  if ( $('#upper-slide-container').is(":visible")) {
    $('#playlist').slideUp('fast', function() {
      $('#upper-slide-container').hide();
    });
  }
}

function playThisInstead() {
  onStopButtonClicked();
  kfjc.startPlaybackPosition = isSelectedShortArchive() ? 0 : 300000;
  onPlayButtonClicked();
  invalidateUi();
}

function showVolume() {
  if ($("#popup-volume-slider").is(":visible")) {
    return;
  }
  $("#popup-volume-slider").show();
  $("#popup-volume-slider").animation("slideInLeft");

}

function hideVolume() {
  if ($("#popup-volume-slider").is(":visible") == undefined) {
    return;
  }
  $("#popup-volume-slider").show();
  $("#popup-volume-slider").animation("slideOutLeft");
}

function calculateShowTime(playlistNum) {
  var shows = kfjc.showList[playlistNum];
  var totalTime = 0;
  var bounds = [];

  for (var i = 0; i < shows.length; i++) {
    var hourPaddingTimeMillis = shows[i].padding_ms;
    var segmentTime = shows[i].duration_ms;
    totalTime += segmentTime - 2 * hourPaddingTimeMillis;
    // Bounds
    bounds[i] = totalTime + hourPaddingTimeMillis;
    if (i == shows.length - 1) {
        bounds[i] += hourPaddingTimeMillis;
    }
  }
  totalTime += 2 * shows[0].padding_ms;
  return {total: totalTime, bounds: bounds};
}

function parseHashNav() {
  var hashNav = $(location).attr('hash').replace("#", "").split(".");
  var showId = hashNav[0];
  var position = hashNav[1];
  if (showId) {
    if (isSelectedShortArchive()) {
      positionMillis = position ? position * 1000 : 0;
    } else {
      positionMillis = position ? position * 1000 : 300000; // TODO: don't hard code 300000
    }
    loadShow(showId, positionMillis);
    seekUiUpdate(positionMillis);
  }
}

// -------- Utilities --------------------------------------------------------------------
function showTimeFormat(startMoment) {
  // 3PM, Saturday 19th August 2017
  return startMoment.tz('America/Los_Angeles').format("hA, dddd D MMMM YYYY");
}

function playlistTimeFormat(startMoment) {
  // 4:20pm
  return startMoment.tz('America/Los_Angeles').format("h:mma");
}

function getMillisUntilNextHour() {
  return 3600000 - (new Date().getTime() % 3600000);
}

function roundUpHour(time) {
  return moment(time * 1000)
    .add(30, "minutes").startOf("hour");
}

/*
 * Polyfill for IE.
 */
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function(searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
  };
}

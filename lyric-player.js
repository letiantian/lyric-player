#!/usr/bin/env node

var fs = require('fs'),
    ansi = require('ansi'),
    Lrc = require('lrc-kit').Lrc,
    keypress = require('keypress'),
    getTextWidth = require('terminal-text-width');

keypress(process.stdin);

const STATE_PLAYING = 1,
      STATE_PAUSE   = 2;

var cursor = ansi(process.stdout);
var playingState   = STATE_PLAYING,
    curEntryIdx    = 0,
    startTimestamp = 0, 
    pauseTimestamp = 0, 
    playAtTimestamp= 0,
    pauseDuration  = 0, 
    offsetDuration = 0;

var renderText = function(text) {
    var columns = process.stdout.columns;
    var width = getTextWidth(text);
    var startPos = parseInt((columns-width)/2);
    return Array(startPos+1).join(" ") + text ;
};

var getTimestamp = function() {
    return Date.now()/1000;
};

var postProcessLrc = function(lrc, offset) {
    lrc.info.ar = lrc.info.ar || "unknown";  // author
    lrc.info.ti = lrc.info.ti || "unknown";  // titile
    lrc.info.al = lrc.info.al || "unknown";  // album
    lrc.info.by = lrc.info.by || "unknown";  // lrc editor

    offset = offset || lrc.info.offset;
    if (offset) {
        lrc.info.offset = Number(offset)/1000;  // to seconds
        for (var i=0; i<lrc.lyrics.length; ++i) {
            lrc.lyrics[i].timestamp += lrc.info.offset;
        }
    }
    else {
        lrc.info.offset = 0
    }
};


var updateCurEntry = function(lrc, curTime) {

    var lyrics = lrc.lyrics;
    var entryNum = lyrics.length;
    if (curTime <= lyrics[0].timestamp) {
        curEntryIdx = 0;
        return;
    }

    if (curTime >= lyrics[entryNum-1].timestamp) {
        curEntryIdx = entryNum-1;
        return;
    }

    //
    if (curEntryIdx < entryNum-1 && curTime >= lyrics[curEntryIdx].timestamp && curTime < lyrics[curEntryIdx+1].timestamp) {
        return;
    }

    if (curEntryIdx < entryNum-2 && curTime >= lyrics[curEntryIdx+1].timestamp && curTime < lyrics[curEntryIdx+2].timestamp) {
        curEntryIdx += 1;
        return;
    }

    // binary search
    var low  = 0,
        mid  = 0,
        high = entryNum-1,
        midNext;

    while (low <= high) {
        mid  = parseInt((low+high)/2);
        midNext = ((mid+1) <= (entryNum-1))? mid+1:mid;

        if ( mid==entryNum-1) {
            curEntryIdx = mid;
            return;
        }

        if ( mid<entryNum-1 && lyrics[mid].timestamp <= curTime && lyrics[mid+1].timestamp >= curTime ) {
            curEntryIdx = mid;
            return;
        }

        if (lyrics[mid].timestamp > curTime) {
            high = mid-1;
            continue;
        }

        if (lyrics[mid+1].timestamp < curTime) {
            low = mid+1;
            continue;
        }  

    }
};

var enterFullscreen = function() {
    console.log('\033[?1049h\033[H');
    cursor.goto(0, 0).hide();
};

var leaveFullscreen = function() {
    console.log('\033[?1049l');
    cursor.show();
};

var clearScreen = function() {
    console.log('\033[2J');
};

var getEntriesToDisplay = function (curEntryIdx, entryNum) {
    var maxRows = process.stdout.rows - 3;
    var halfRows = parseInt(maxRows/2);
    var result = [];
    if (curEntryIdx <= halfRows) {
        for(var i=0; i<maxRows; ++i) {
            result.push(i);
        }
    } else {
        for(var i=-halfRows; i<=halfRows; ++i) {
            result.push(curEntryIdx+i);
        }
    }

    return result;
};


var secondsToHuman = function(seconds) {
    minutes = parseInt(playAtTimestamp/60);
    seconds = seconds - minutes*60;
    return '' + minutes + ':' + seconds.toFixed(2);
};

var display = function(lrc) {
    clearScreen();
    cursor.goto(0, 0);

    var entries = getEntriesToDisplay(curEntryIdx, lrc.lyrics.length);

    console.log( renderText( lrc.info.ti + ' ' +  lrc.info.ar + ' ' + secondsToHuman(playAtTimestamp)) );

    console.log();

    for (var i=0; i < entries.length; ++i) {
        entryIdx = entries[i];
        if (entryIdx >= lrc.lyrics.length) break;
        if (entryIdx == curEntryIdx) {
            cursor.hex('#a71d5d').bold();
            console.log( renderText( lrc.lyrics[entryIdx].content ) );
            cursor.reset();       
        } else {
            console.log( renderText( lrc.lyrics[entryIdx].content ) );
        }
    }

};

var intervelFunc = function() {
    playAtTimestamp = getTimestamp() - startTimestamp - pauseDuration + offsetDuration;
    updateCurEntry(this.lrc, playAtTimestamp);
    display(this.lrc);
};


//// main
filepath = process.argv[2]
if (!filepath) {
    console.log('\n  error, no lrc file specified \n');
    process.exit(1);
}

fs.readFile(filepath, 'utf-8', function(err,data) {
    var lrc = Lrc.parse(data);
    postProcessLrc(lrc);

    enterFullscreen();

    var ifunc = intervelFunc.bind({lrc:lrc});
    startTimestamp = getTimestamp();
    var intervalObj = setInterval(ifunc, 100);

    process.stdin.on('keypress', function (ch, key) {
        if (key && key.name == 'space') {
            if (playingState == STATE_PLAYING) {    // to pause
                clearInterval(intervalObj);
                pauseTimestamp = getTimestamp();
                playingState = STATE_PAUSE;
            } else {                                // to play
                intervalObj = setInterval(ifunc, 100);
                pauseDuration += getTimestamp() - pauseTimestamp;
                playingState = STATE_PLAYING;
            }
        }
        else if (key && key.name == 'left' && playingState != STATE_PAUSE) {
            offsetDuration += -3;
            clearInterval(intervalObj);
            intervalObj = setInterval(ifunc, 100);
        } else if (key && key.name == 'right' && playingState != STATE_PAUSE) {
            offsetDuration += 3;
            clearInterval(intervalObj);
            intervalObj = setInterval(ifunc, 100);
        } else if (key && key.ctrl && key.name == 'c') {
            leaveFullscreen();
            process.exit(0);
        }
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();

});
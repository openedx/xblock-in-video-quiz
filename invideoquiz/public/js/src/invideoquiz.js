/* Javascript for InVideoQuizXBlock. */
function InVideoQuizXBlock(runtime, element) {
    $('.in-video-quiz-block').closest('.vert').hide();
    var videoId = $('.in-video-quiz-block').data('videoid');
    if (!videoId || !InVideoQuizXBlock.config.hasOwnProperty(videoId)) {
        return;
    }
    var videoConfig = InVideoQuizXBlock.config[videoId];
    var problemTimesMap = videoConfig.timemap || {};
    var jumpBackValue = videoConfig.jumpBack || '';
    var studentMode = $('.in-video-quiz-block').data('mode') !== 'staff';
    var extraVideoButtons =
        '<button class="in-video-continue">Continue</button>' +
        '<button class="in-video-jump-back">' +
        '<svg width="14" height="16" viewBox="0 0 10 12" fill="none" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M4.875 11.375C4.19792 11.375 3.56372 11.2464 2.9724 10.9891C2.38108 10.7318 1.86649 10.3842 1.42865 9.94635C0.990799 9.50851 0.643229 8.99392 0.385938 8.4026C0.128646 7.81128 0 7.17708 0 6.5H1.08333C1.08333 7.55625 1.45122 8.45226 2.18698 9.18802C2.92274 9.92379 3.81875 10.2917 4.875 10.2917C5.93125 10.2917 6.82726 9.92379 7.56302 9.18802C8.29879 8.45226 8.66667 7.55625 8.66667 6.5C8.66667 5.44375 8.29879 4.54774 7.56302 3.81198C6.82726 3.07622 5.93125 2.70833 4.875 2.70833H4.79375L5.63333 3.54792L4.875 4.33333L2.70833 2.16667L4.875 0L5.63333 0.785417L4.79375 1.625H4.875C5.55208 1.625 6.18628 1.75365 6.7776 2.01094C7.36892 2.26823 7.88351 2.6158 8.32135 3.05365C8.7592 3.49149 9.10677 4.00608 9.36406 4.5974C9.62135 5.18872 9.75 5.82292 9.75 6.5C9.75 7.17708 9.62135 7.81128 9.36406 8.4026C9.10677 8.99392 8.7592 9.50851 8.32135 9.94635C7.88351 10.3842 7.36892 10.7318 6.7776 10.9891C6.18628 11.2464 5.55208 11.375 4.875 11.375Z" fill="#2A2A2A"/>' +
        '</svg>' +
        '<span>Rewatch this part</span>' +
        '</button>';
    var video;
    var videoState;

    var knownDimensions;
    var problemScale = 0.9;

    // Interval at which to check if video size has changed size
    // and the displayed problems needs to do the same
    var resizeIntervalTime = 100;

    // Interval at which to check for problems to display
    // Checking every 0.5 seconds to make sure we check at least once per actual second of video
    var displayIntervalTime = 500;

    // Timeout to wait before checking for problems again after "play" is clicked
    // Waiting 1.5 seconds to make sure we are moved to the next second and we don't get a double firing
    var displayIntervalTimeout = 1500;

    $(function() {
        $('#seq_content .vert-mod .vert, #course-content .vert-mod .vert').each(function() {
            var component = $(this);

            if (studentMode) {
                setUpStudentView(component);
            } else {
                showProblemTimesToInstructor(component);
            }
        });

        if (studentMode) {
            knownDimensions = getDimensions();
            bindVideoEvents();
        }
    });

    function parseTimeToSeconds(value) {
        var text = (value || '').toString();
        if (text.indexOf(':') !== -1) {
            var parts = text.split(':');
            if (parts.length === 2) {
                var minutes = parseInt(parts[0], 10);
                var seconds = parseInt(parts[1], 10);
                if (!isNaN(minutes) && !isNaN(seconds)) {
                    return (minutes * 60) + seconds;
                }
            }
            return NaN;
        }
        return parseInt(text, 10);
    }

    function formatTimeFromSeconds(totalSeconds) {
        var minutes = parseInt(totalSeconds / 60, 10);
        var seconds = ('0' + (totalSeconds % 60)).slice(-2);
        return minutes + ':' + seconds;
    }

    function parseJumpBackConfig(value) {
        if (!value) {
            return {
                map: {},
                defaultValue: ''
            };
        }
        if (typeof value === 'object') {
            return {
                map: value,
                defaultValue: ''
            };
        }
        if (typeof value === 'string') {
            var trimmed = value.trim();
            if (trimmed.charAt(0) === '{') {
                try {
                    return {
                        map: JSON.parse(trimmed),
                        defaultValue: ''
                    };
                } catch (err) {
                    return {
                        map: {},
                        defaultValue: ''
                    };
                }
            }
            return {
                map: {},
                defaultValue: trimmed
            };
        }
        return {
            map: {},
            defaultValue: ''
        };
    }

    function buildProblemTimesMap() {
        var normalized = {};
        $.each(problemTimesMap, function(time, componentId) {
            var seconds = parseTimeToSeconds(time);
            if (!isNaN(seconds)) {
                normalized[seconds] = componentId;
            }
        });
        return normalized;
    }

    function buildJumpBackTimesMap() {
        var parsed = parseJumpBackConfig(jumpBackValue);
        var normalized = {};
        $.each(parsed.map, function(time, jumpTo) {
            var seconds = parseTimeToSeconds(time);
            if (!isNaN(seconds)) {
                normalized[seconds] = jumpTo;
            }
        });
        return {
            map: normalized,
            defaultValue: parsed.defaultValue
        };
    }

    function setUpStudentView(component) {
        var componentIsVideo = component.data('id').indexOf(videoId) !== -1;
        if (componentIsVideo) {
            video = $('.video', component);
        } else {
            $.each(problemTimesMap, function(time, componentId) {
                if (component.data('id').indexOf(componentId) !== -1) {
                    component.addClass('in-video-problem-wrapper');
                    var problemView = $('.xblock-student_view', component);
                    // Only add buttons if they don't already exist
                    if (problemView.find('.in-video-continue').length === 0) {
                        problemView.append(extraVideoButtons);
                    }
                    problemView.addClass('in-video-problem').hide();
                }
            });
        }
    }

    function getDimensions() {
        var $wrapper = $('.tc-wrapper', video);
        var pos = $wrapper.position() || {
            top: 0,
            left: 0
        };
        var height = parseInt($wrapper.css('height'), 10) || $wrapper.height() || 0;
        var width = parseInt($wrapper.css('width'), 10) || $wrapper.width() || 0;
        return {
            top: Math.round(pos.top),
            left: Math.round(pos.left),
            height: Math.round(height),
            width: Math.round(width)
        };
    }

    function dimensionsHaveChanged(newDimensions) {
        if (!knownDimensions) {
            return true;
        }
        var keys = ['top', 'left', 'height', 'width'];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (newDimensions.hasOwnProperty(key)) {
                if (knownDimensions[key] !== newDimensions[key]) {
                    return true;
                }
            }
        }
        return false;
    }

    function showProblemTimesToInstructor(component) {
        $.each(problemTimesMap, function(time, componentId) {
            var isInVideoComponent = component.data('id').indexOf(componentId) !== -1;
            if (isInVideoComponent) {
                var displayTime = time;
                if (time.toString().indexOf(':') === -1) {
                    displayTime = formatTimeFromSeconds(parseInt(time, 10));
                }
                var timeParagraph = '<p class="in-video-alert"><i class="fa fa-exclamation-circle"></i>This component will appear in the video at <strong>' + displayTime + '</strong></p>';
                component.prepend(timeParagraph);
            }
        });
    }

    function resizeInVideoProblem(currentProblem, dimensions) {
        var targetWidth = Math.round(dimensions.width * problemScale);
        var targetHeight = Math.round(dimensions.height * problemScale);
        var left = Math.round(dimensions.left + (dimensions.width - targetWidth) / 2);
        var top = Math.round(dimensions.top + (dimensions.height - targetHeight) / 2);

        currentProblem.css({
            position: 'absolute',
            width: targetWidth + 'px',
            height: targetHeight + 'px',
            left: left + 'px',
            top: top + 'px',
            margin: 0
        });
    }

    // Bind In Video Quiz display to video time, as well as play and pause buttons
    function bindVideoEvents() {
        var canDisplayProblem = true;
        var intervalObject;
        var resizeIntervalObject;
        var problemToDisplay;
        var currentProblemTime;
        var normalizedProblemTimesMap = buildProblemTimesMap();
        var jumpBackConfig = buildJumpBackTimesMap();

        video.on('play', function() {
            videoState = videoState || video.data('video-player-state');

            clearInterval(resizeIntervalObject);

            if (problemToDisplay) {
                window.setTimeout(function() {
                    canDisplayProblem = true;
                }, displayIntervalTimeout);
                problemToDisplay.hide();
                problemToDisplay = null;
                currentProblemTime = null;
            }

            intervalObject = setInterval(function() {
                var videoTime = parseInt(videoState.videoPlayer.currentTime, 10);
                var problemToDisplayId = normalizedProblemTimesMap[videoTime];
                if (problemToDisplayId && canDisplayProblem) {
                    $('.wrapper-downloads, .video-controls', video).hide();
                    $('#seq_content .vert-mod .vert, #course-content .vert-mod .vert').each(function() {
                        var isProblemToDisplay = $(this).data('id').indexOf(problemToDisplayId) !== -1;
                        if (isProblemToDisplay) {
                            problemToDisplay = $('.xblock-student_view', this)
                            videoState.videoPlayer.pause();
                            resizeInVideoProblem(problemToDisplay, getDimensions());
                            problemToDisplay.show();
                            problemToDisplay.css({
                                display: 'block'
                            });
                            canDisplayProblem = false;
                            currentProblemTime = videoTime;
                        }
                    });
                }
            }, displayIntervalTime);
        });

        video.on('pause', function() {
            videoState = videoState || video.data('video-player-state');
            clearInterval(intervalObject);
            if (problemToDisplay) {
                resizeIntervalObject = setInterval(function() {
                    var currentDimensions = getDimensions();
                    if (dimensionsHaveChanged(currentDimensions)) {
                        resizeInVideoProblem(problemToDisplay, currentDimensions);
                        knownDimensions = currentDimensions;
                    }
                }, resizeIntervalTime);

                var jumpBackTarget = jumpBackConfig.map[currentProblemTime];
                var hasJumpBack = jumpBackTarget || jumpBackConfig.defaultValue;
                if (hasJumpBack) {
                    $('.in-video-jump-back', problemToDisplay).show();
                } else {
                    $('.in-video-jump-back', problemToDisplay).hide();
                }

                $('.in-video-continue', problemToDisplay).on('click', function() {
                    $('.wrapper-downloads, .video-controls', video).show();
                    videoState.videoPlayer.play();
                });
                $('.in-video-jump-back', problemToDisplay).on('click', function() {
                    var jumpBackTarget = jumpBackConfig.map[currentProblemTime];
                    var jumpBackSeconds = parseTimeToSeconds(jumpBackTarget || jumpBackConfig.defaultValue);
                    console.log('Jump back - currentProblemTime:', currentProblemTime, 'target:', jumpBackTarget, 'seconds:', jumpBackSeconds);
                    if (!isNaN(jumpBackSeconds)) {
                        $('.wrapper-downloads, .video-controls', video).show();
                        if (videoState.videoPlayer.player && videoState.videoPlayer.player.seekTo) {
                            videoState.videoPlayer.player.seekTo(jumpBackSeconds);
                        } else {
                            videoState.videoPlayer.currentTime = jumpBackSeconds;
                        }
                        videoState.videoPlayer.play();
                    }
                });
            }
        });
    }
}

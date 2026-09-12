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
        '<div class="in-video-problem-actions">' +
        '<button type="button" class="in-video-continue">Continue</button>' +
        '<button type="button" class="in-video-jump-back">' +
        '<svg width="14" height="16" viewBox="0 0 10 12" fill="none" ' +
        'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M4.875 11.375C4.19792 11.375 3.56372 11.2464 2.9724 10.9891C2.38108 10.7318 1.86649 10.3842 1.42865 9.94635C0.990799 9.50851 0.643229 8.99392 0.385938 8.4026C0.128646 7.81128 0 7.17708 0 6.5H1.08333C1.08333 7.55625 1.45122 8.45226 2.18698 9.18802C2.92274 9.92379 3.81875 10.2917 4.875 10.2917C5.93125 10.2917 6.82726 9.92379 7.56302 9.18802C8.29879 8.45226 8.66667 7.55625 8.66667 6.5C8.66667 5.44375 8.29879 4.54774 7.56302 3.81198C6.82726 3.07622 5.93125 2.70833 4.875 2.70833H4.79375L5.63333 3.54792L4.875 4.33333L2.70833 2.16667L4.875 0L5.63333 0.785417L4.79375 1.625H4.875C5.55208 1.625 6.18628 1.75365 6.7776 2.01094C7.36892 2.26823 7.88351 2.6158 8.32135 3.05365C8.7592 3.49149 9.10677 4.00608 9.36406 4.5974C9.62135 5.18872 9.75 5.82292 9.75 6.5C9.75 7.17708 9.62135 7.81128 9.36406 8.4026C9.10677 8.99392 8.7592 9.50851 8.32135 9.94635C7.88351 10.3842 7.36892 10.7318 6.7776 10.9891C6.18628 11.2464 5.55208 11.375 4.875 11.375Z" fill="#2A2A2A"/>' +
        '</svg>' +
        '<span>Rewatch this part</span>' +
        '</button>' +
        '</div>';
    var video;
    var videoState;

    var knownDimensions;
    var problemScale = 1;

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
        try {
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
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('InVideoQuizXBlock initialization error', err);
            }
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

    function normalizeProblemIds(componentId) {
        if ($.isArray(componentId)) {
            return componentId;
        }
        if (componentId) {
            return [componentId];
        }
        return [];
    }

    function componentMatchesId(component, componentId) {
        var componentDataId = component.data('id');
        return !!(componentDataId && componentId && componentDataId.indexOf(componentId) !== -1);
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

    function looksLikeTimeKey(key) {
        var text = (key || '').toString();
        if (text.indexOf(':') !== -1) {
            return true;
        }
        return /^\d{1,5}$/.test(text);
    }

    function buildJumpBackTimesMap() {
        var parsed = parseJumpBackConfig(jumpBackValue);
        var byTime = {};
        var byId = {};
        $.each(parsed.map, function(key, jumpTo) {
            if (looksLikeTimeKey(key)) {
                var seconds = parseTimeToSeconds(key);
                if (!isNaN(seconds)) {
                    byTime[seconds] = jumpTo;
                }
            } else {
                byId[key] = jumpTo;
            }
        });
        return {
            byTime: byTime,
            byId: byId,
            defaultValue: parsed.defaultValue
        };
    }

    function resolveJumpBackTarget(jumpBackConfig, problemId, problemTime) {
        if (problemId && jumpBackConfig.byId[problemId] !== undefined) {
            return jumpBackConfig.byId[problemId];
        }
        if (jumpBackConfig.byTime[problemTime] !== undefined) {
            return jumpBackConfig.byTime[problemTime];
        }
        return jumpBackConfig.defaultValue;
    }

    function wrapProblemContent(problemView) {
        if (problemView.find('> .in-video-problem-content').length > 0) {
            return;
        }
        var contentWrapper = $('<div class="in-video-problem-content"></div>');
        problemView.children().not('.in-video-problem-actions').appendTo(contentWrapper);
        problemView.prepend(contentWrapper);
    }

    function setUpStudentView(component) {
        var componentIsVideo = component.data('id').indexOf(videoId) !== -1;
        if (componentIsVideo) {
            video = $('.video', component);
        } else {
            $.each(problemTimesMap, function(time, componentId) {
                normalizeProblemIds(componentId).forEach(function(id) {
                    if (componentMatchesId(component, id)) {
                        component.addClass('in-video-problem-wrapper');
                        var problemView = $('.xblock-student_view', component);
                        // Only add buttons if they don't already exist
                        if (problemView.find('.in-video-continue').length === 0) {
                            problemView.append(extraVideoButtons);
                        }
                        wrapProblemContent(problemView);
                        problemView.addClass('in-video-problem').hide();
                    }
                });
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
            normalizeProblemIds(componentId).forEach(function(id) {
                if (componentMatchesId(component, id)) {
                    var displayTime = time;
                    if (time.toString().indexOf(':') === -1) {
                        displayTime = formatTimeFromSeconds(parseInt(time, 10));
                    }
                    var timeParagraph = '<p class="in-video-alert"><i class="fa fa-exclamation-circle"></i>This component will appear in the video at <strong>' + displayTime + '</strong></p>';
                    component.prepend(timeParagraph);
                }
            });
        });
    }

    function isVideoFullscreen() {
        return $('html').hasClass('video-fullscreen') ||
            !!(video && video.hasClass('video-fullscreen'));
    }

    function storeProblemPlacement(problemEl) {
        if (!problemEl.data('invideoquiz-original-parent')) {
            problemEl.data('invideoquiz-original-parent', problemEl.parent());
            problemEl.data('invideoquiz-original-next', problemEl.next());
        }
    }

    function getVideoMountTarget() {
        var $tcWrapper = $('.tc-wrapper', video);
        return $tcWrapper.length ? $tcWrapper : video;
    }

    function getVideoOverlayTarget() {
        var $videoWrapper = $('.tc-wrapper .video-wrapper', video);
        return $videoWrapper.length ? $videoWrapper : getVideoMountTarget();
    }

    function setFullscreenQuizVideoVisible(visible) {
        if (!video || !video.length) {
            return;
        }
        var $tcWrapper = $('.tc-wrapper', video);
        var $videoWrapper = $('.tc-wrapper .video-wrapper', video);
        if (visible) {
            video.removeClass('in-video-quiz-active');
            $tcWrapper.css('position', '');
            $videoWrapper.css('visibility', '');
        } else {
            video.addClass('in-video-quiz-active');
            $videoWrapper.css('visibility', 'hidden');
        }
    }

    function resizeFullscreenProblemOverlay(currentProblem) {
        if (!currentProblem || !currentProblem.css) {
            return;
        }
        var $target = getVideoOverlayTarget();
        if (!$target.length) {
            return;
        }
        var width = $target.outerWidth();
        var height = $target.outerHeight();
        var offset = $target.position() || { top: 0, left: 0 };

        currentProblem.css({
            position: 'absolute',
            width: width + 'px',
            height: height + 'px',
            left: Math.round(offset.left) + 'px',
            top: Math.round(offset.top) + 'px',
            margin: 0,
            display: 'flex'
        });
    }

    function mountProblemInVideo(problemEl, hideVideoContent) {
        if (!problemEl || !problemEl.length || !video || !video.length) {
            return;
        }
        storeProblemPlacement(problemEl);
        if (!problemEl.hasClass('in-video-problem-fullscreen-mounted')) {
            problemEl.appendTo(getVideoMountTarget());
            problemEl.addClass('in-video-problem-fullscreen-mounted');
        }
        if (hideVideoContent !== false) {
            setFullscreenQuizVideoVisible(false);
        }
    }

    function unmountProblemFromVideo(problemEl) {
        if (!problemEl || !problemEl.length ||
                !problemEl.hasClass('in-video-problem-fullscreen-mounted')) {
            return;
        }
        var parent = problemEl.data('invideoquiz-original-parent');
        if (parent && parent.length) {
            var next = problemEl.data('invideoquiz-original-next');
            if (next && next.length) {
                problemEl.insertBefore(next);
            } else {
                problemEl.appendTo(parent);
            }
        }
        problemEl.removeClass('in-video-problem-fullscreen-mounted');
        setFullscreenQuizVideoVisible(true);
    }

    function clearProblemOverlayInlineStyles(currentProblem) {
        currentProblem.css({
            position: '',
            width: '',
            height: '',
            left: '',
            top: '',
            right: '',
            bottom: '',
            margin: ''
        });
    }

    function resizeInVideoProblem(currentProblem, dimensions) {
        if (!currentProblem || !currentProblem.css) {
            return;
        }
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

    function ensureFullscreenSubtitlesVisible() {
        if (isVideoFullscreen()) {
            restoreSubtitlesLayout();
        }
    }

    function restoreSubtitlesLayout() {
        $('.subtitles', video).css({ display: '', visibility: '' });
    }

    function restoreVideoLayout() {
        if (!video || !video.length) {
            return;
        }
        video.removeClass('in-video-quiz-active');
        $('.tc-wrapper .video-wrapper', video).css('visibility', '');
        restoreSubtitlesLayout();
        videoState = video.data('video-player-state') || videoState;
        if (videoState && videoState.resizer && videoState.resizer.align) {
            videoState.resizer.align();
        }
        video.trigger('caption:resize');
    }

    function applyProblemOverlayLayout(currentProblem) {
        if (!currentProblem || !currentProblem.css) {
            return;
        }
        if (isVideoFullscreen()) {
            clearProblemOverlayInlineStyles(currentProblem);
            mountProblemInVideo(currentProblem, false);
            resizeFullscreenProblemOverlay(currentProblem);
            setFullscreenQuizVideoVisible(false);
            ensureFullscreenSubtitlesVisible();
            return;
        }
        unmountProblemFromVideo(currentProblem);
        resizeInVideoProblem(currentProblem, getDimensions());
    }

    function resetProblemScroll(currentProblem) {
        if (!currentProblem || !currentProblem.length) {
            return;
        }
        var content = currentProblem.find('.in-video-problem-content');
        if (content.length) {
            content.scrollTop(0);
        } else {
            currentProblem.scrollTop(0);
        }
    }

    function getHiddenVideoChromeSelector() {
        return '.wrapper-downloads, .closed-captions';
    }

    function hideVideoChrome() {
        $(getHiddenVideoChromeSelector(), video).hide();
        var $wrapper = $('.tc-wrapper', video);
        if ($wrapper.length && $wrapper.data('invideoquiz-overflow') === undefined) {
            $wrapper.data('invideoquiz-overflow', $wrapper.css('overflow'));
            $wrapper.css('overflow', 'hidden');
        }
    }

    function showVideo() {
        $(getHiddenVideoChromeSelector(), video).show();
        var $wrapper = $('.tc-wrapper', video);
        if ($wrapper.length && $wrapper.data('invideoquiz-overflow') !== undefined) {
            $wrapper.css('overflow', $wrapper.data('invideoquiz-overflow'));
            $wrapper.removeData('invideoquiz-overflow');
        }
        restoreVideoLayout();
    }

    function seekVideoTo(seconds) {
        if (!videoState || !videoState.videoPlayer) {
            return;
        }
        var player = videoState.videoPlayer;
        if (typeof player.seekTo === 'function') {
            player.seekTo(seconds);
            return;
        }
        if (player.player && typeof player.player.seekTo === 'function') {
            player.player.seekTo(seconds, true);
            return;
        }
        player.currentTime = seconds;
    }

    // Bind In Video Quiz display to video time, as well as play and pause buttons
    function bindVideoEvents() {
        var canDisplayProblem = true;
        var intervalObject;
        var resizeIntervalObject;
        var problemToDisplay;
        var currentProblemTime;
        var currentProblemId;
        var problemQueue = [];
        var queueIndex = 0;
        var isAdvancingProblemQueue = false;
        var normalizedProblemTimesMap = buildProblemTimesMap();
        var jumpBackConfig = buildJumpBackTimesMap();

        function clearResizeInterval() {
            if (resizeIntervalObject) {
                clearInterval(resizeIntervalObject);
                resizeIntervalObject = null;
            }
        }

        function hideAllInVideoProblems() {
            $('#seq_content .in-video-problem, #course-content .in-video-problem').hide();
        }

        function hideProblemToDisplay(options) {
            options = options || {};
            clearResizeInterval();
            if (problemToDisplay) {
                unmountProblemFromVideo(problemToDisplay);
                problemToDisplay.hide();
                problemToDisplay = null;
            }
            if (options.restoreVideo) {
                showVideo();
            }
        }

        function showProblemById(problemId, videoTime, options) {
            options = options || {};
            $('#seq_content .vert-mod .vert, #course-content .vert-mod .vert').each(function() {
                if (componentMatchesId($(this), problemId)) {
                    hideAllInVideoProblems();
                    problemToDisplay = $('.xblock-student_view', this);
                    if (!options.skipPause && videoState && videoState.videoPlayer) {
                        videoState.videoPlayer.pause();
                    }
                    applyProblemOverlayLayout(problemToDisplay);
                    problemToDisplay.show().css('display', 'flex');
                    resetProblemScroll(problemToDisplay);
                    canDisplayProblem = false;
                    currentProblemTime = videoTime;
                    currentProblemId = problemId;
                }
            });
        }

        function hasMoreQueuedProblemsAfterCurrent() {
            return queueIndex < problemQueue.length - 1;
        }

        function bindProblemControls() {
            if (!problemToDisplay) {
                return;
            }

            clearResizeInterval();
            var wasFullscreen = isVideoFullscreen();
            resizeIntervalObject = setInterval(function() {
                var currentDimensions = getDimensions();
                var nowFullscreen = isVideoFullscreen();

                if (dimensionsHaveChanged(currentDimensions) || nowFullscreen !== wasFullscreen) {
                    applyProblemOverlayLayout(problemToDisplay);
                    if (nowFullscreen) {
                        resizeFullscreenProblemOverlay(problemToDisplay);
                    }
                    knownDimensions = currentDimensions;
                    wasFullscreen = nowFullscreen;
                }
            }, resizeIntervalTime);

            resetProblemScroll(problemToDisplay);

            problemToDisplay.off('click.invideoquizSubmit').on(
                'click.invideoquizSubmit',
                '.submit-problem-button, button.submit, input.submit',
                function() {
                    window.setTimeout(function() {
                        resetProblemScroll(problemToDisplay);
                    }, 0);
                    window.setTimeout(function() {
                        resetProblemScroll(problemToDisplay);
                    }, 300);
                }
            );

            var jumpBackTarget = resolveJumpBackTarget(jumpBackConfig, currentProblemId, currentProblemTime);
            var hasJumpBack = jumpBackTarget || jumpBackConfig.defaultValue;
            if (hasJumpBack) {
                $('.in-video-jump-back', problemToDisplay).show();
            } else {
                $('.in-video-jump-back', problemToDisplay).hide();
            }

            $('.in-video-continue', problemToDisplay).off('click').on('click', function() {
                isAdvancingProblemQueue = true;
                hideProblemToDisplay();
                queueIndex += 1;
                if (queueIndex < problemQueue.length) {
                    showNextQueuedProblem(currentProblemTime, { skipPause: true });
                    bindProblemControls();
                    window.setTimeout(function() {
                        isAdvancingProblemQueue = false;
                    }, 0);
                    return;
                }
                isAdvancingProblemQueue = false;
                problemQueue = [];
                queueIndex = 0;
                currentProblemTime = null;
                currentProblemId = null;
                canDisplayProblem = false;
                window.setTimeout(function() {
                    canDisplayProblem = true;
                }, displayIntervalTimeout);
                showVideo();
                videoState.videoPlayer.play();
            });
            $('.in-video-jump-back', problemToDisplay).off('click').on('click', function() {
                var jumpBackTargetValue = resolveJumpBackTarget(jumpBackConfig, currentProblemId, currentProblemTime);
                var jumpBackSeconds = parseTimeToSeconds(jumpBackTargetValue || jumpBackConfig.defaultValue);
                if (!isNaN(jumpBackSeconds)) {
                    problemQueue = [];
                    queueIndex = 0;
                    hideProblemToDisplay({ restoreVideo: true });
                    canDisplayProblem = true;
                    currentProblemTime = null;
                    currentProblemId = null;
                    seekVideoTo(jumpBackSeconds);
                    videoState.videoPlayer.play();
                }
            });
        }

        function showNextQueuedProblem(videoTime, options) {
            options = options || {};
            if (queueIndex >= problemQueue.length) {
                problemQueue = [];
                queueIndex = 0;
                canDisplayProblem = true;
                return;
            }
            hideVideoChrome();
            showProblemById(problemQueue[queueIndex], videoTime, options);
        }

        video.on('fullscreen', function() {
            if (problemToDisplay) {
                applyProblemOverlayLayout(problemToDisplay);
            }
        });

        video.on('play', function() {
            videoState = videoState || video.data('video-player-state');

            clearInterval(resizeIntervalObject);

            if (problemToDisplay && !isAdvancingProblemQueue &&
                    !hasMoreQueuedProblemsAfterCurrent()) {
                window.setTimeout(function() {
                    canDisplayProblem = true;
                }, displayIntervalTimeout);
                hideProblemToDisplay({ restoreVideo: true });
                currentProblemTime = null;
                currentProblemId = null;
                problemQueue = [];
                queueIndex = 0;
            }

            intervalObject = setInterval(function() {
                var videoTime = parseInt(videoState.videoPlayer.currentTime, 10);
                var problemValue = normalizedProblemTimesMap[videoTime];
                if (problemValue && canDisplayProblem) {
                    problemQueue = normalizeProblemIds(problemValue);
                    queueIndex = 0;
                    showNextQueuedProblem(videoTime);
                }
            }, displayIntervalTime);
        });

        video.on('pause', function() {
            videoState = videoState || video.data('video-player-state');
            clearInterval(intervalObject);
            if (problemToDisplay) {
                bindProblemControls();
            }
        });
    }
}

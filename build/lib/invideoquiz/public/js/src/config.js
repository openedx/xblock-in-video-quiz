// Curly braces are all doubled because this file gets called and formatted by python

var InVideoQuizXBlock = InVideoQuizXBlock || {{}};

(function () {{
    InVideoQuizXBlock.config = InVideoQuizXBlock.config || {{}};

    var videoId = '{video_id}';
    // This is (temporary) error handling for previous-submitted invalid timemap.
    try {{        
        if (videoId) {{
            InVideoQuizXBlock.config[videoId] = JSON.parse(`{timemap}`);
        }}
    }}
    catch {{
        InVideoQuizXBlock.config[videoId] = {{}};
    }}
}}());

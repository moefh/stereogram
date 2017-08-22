
var parse_shader_program = (function() {

    /**
     * Extract shader source, keeping line numbers
     */
    var extract_shader_source = function(text, start, end) {
        var before = text.slice(0, start);
        var middle = text.slice(start, end);
        var after = text.slice(end, text.length);
        
        before = before.replace(/[^\n]/g, "");
        after = after.replace(/[^\n]/g, "");
        
        return before + middle + after;
    };

    /**
     * Parse variable declarations for attributes and uniforms
     */
    var parse_vars = function(text, start, end) {
        var lines = text.slice(start, end).split(/\n+/);
    
        var ret = {};
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.substr(0,3) == "//!")
                continue;
            
            var parts = line.trim().split(/\s+/);
            if (parts[0] == "")
                continue;
            if (parts.length < 2 || parts.length > 3)
                throw "invalid attribute/uniform specification: '" + line + "'";
            var val = (typeof(parts[2]) == 'undefined') ? parts[2] : parseFloat(parts[2]);
            ret[parts[0]] = { type: parts[1], value: val };
        }
        return ret;
    };

    /**
     * Parse program source and extract uniforms, attributes, vertex shader and fragment shader
     */
    return function(src, text) {
        var section_names = [ "ATTRIBUTES", "UNIFORMS", "VERTEX", "FRAGMENT" ];
        
        var sections = [];
        for (var i = 0; i < section_names.length; i++)
            sections[i] = { start:text.indexOf("//!" + section_names[i]), end:text.length, name:section_names[i] };
        
        sections.sort(function(a, b) {
            return a.start - b.start;
        });
        
        for (var i = 0; i < sections.length-1; i++)
            sections[i].end = sections[i+1].start;
        
        var decls = {};
        for (var i = 0; i < sections.length; i++)
            decls[sections[i].name] = sections[i];
        
        if (decls.VERTEX.start < 0) throw "invalid program '" + src + "': vertex shader not found";
        if (decls.FRAGMENT.start < 0) throw "invalid program '" + src + "': fragment shader not found";
        
        var vtx = extract_shader_source(text, decls.VERTEX.start, decls.VERTEX.end);
        var frag = extract_shader_source(text, decls.FRAGMENT.start, decls.FRAGMENT.end);
        var attributes = parse_vars(text, decls.ATTRIBUTES.start, decls.ATTRIBUTES.end);
        var uniforms = parse_vars(text, decls.UNIFORMS.start, decls.UNIFORMS.end);
        
        return {
            uniforms : uniforms,
            attributes : attributes,
            vertexShader : vtx,
            fragmentShader : frag
        };
    };
})();

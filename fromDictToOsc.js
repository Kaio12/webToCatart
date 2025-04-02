function dictionary(dict_name) {
  var d = new Dict(dict_name);
  var args = d.get("args");
    
    outlet(0, args);
    post("sampleId:", args, "\n");
  
}
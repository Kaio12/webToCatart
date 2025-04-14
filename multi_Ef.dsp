import("stdfaust.lib");

maxduration = 1;
duration = hslider("duration", 0, 0, 100, 0.001)* 0.001:si.smoo;
fb = hslider("feedback", 0, 0, 1, 0.01);

maxdel = 4096;
intdel = hslider("intdel", 0, 0, maxdel, 1):si.smoo;
g = hslider("g", 0, 0, 1, 0.001):si.smoo;

process= _ : fi.fbcombfilter(maxdel,intdel,g) : ef.echo(maxduration, duration, fb);
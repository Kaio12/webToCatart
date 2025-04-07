//script coté navigateur
//intègre des sliders (nexusUI) et un nuage de points (chart.js)
// envoie (et reçoit) des messages via socket.io vers ou de max/msp

//sendOSC met en forme et envoie les messages OSC
function sendOSC(address, args) {
    if (socket && socket.connected) {
      console.log("🚀 Sending OSC:", address, args);
        socket.emit('osc', { address, args });
    } else {
        console.error("Socket is not connected. Cannot send OSC message.");
    }
}

// construit les sliders
document.addEventListener('DOMContentLoaded', () => {
    const toggleleft = document.getElementById('toggle-left');
    const sidebarleft = document.getElementById('sidebarleft');
    const toggleright = document.getElementById('toggle-right');
    const sidebarright = document.getElementById('sidebarright');

    const body = document.body;

    toggleleft.addEventListener('click', () => {
        sidebarleft.classList.toggle('hidden');
        body.classList.toggle('sidebarleft-hidden');
    });

    toggleright.addEventListener('click', () => {
        sidebarright.classList.toggle('hidden');
        body.classList.toggle('sidebright-hidden');
    });

    let multisliderRight = new Nexus.Multislider('#multisliderRight', {
    'size': [200,600],
    'numberOfSliders': 3,
    'min': 0,
    'max': 1,
    'step': 0,
    'candycane': 3,
    'values': [0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1],
    'smoothing': 0,
    'mode': 'bar',
    });

    multisliderRight.colorize("accent","#ff0");
    multisliderRight.colorize("fill","#333");

    multisliderRight.on('change',function(v) {
  console.log(v);
  sendOSC("/multisliderRight", v);
    });

    let multisliderLeft = new Nexus.Multislider('#multisliderLeft',{
    'size': [200,600],
    'numberOfSliders': 3,
    'min': 0,
    'max': 1,
    'step': 0,
    'candycane': 3,
    'values': [0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1],
    'smoothing': 0,
    'mode': 'bar',
    });

    multisliderLeft.colorize("accent","#ff0");
    multisliderLeft.colorize("fill","#333");

    multisliderLeft.on('change',function(v) {
  console.log(v);
  sendOSC("/multisliderLeft", v);
    });
});

const ctx = document.getElementById('myChart').getContext('2d');

//socket.io connection
const socket = io("http://127.0.0.1:5001/browser"); // Connect to the /browser namespace

socket.on('connect', function() {
    console.log('Connecté ou pas?');
    socket.emit('message', "Hello from the browser");
});

let myChart;
let data;
let bounds;

function getBounds(data) {
  let xs = data.map(p => p.x);
  let ys = data.map(p => p.y);
  let ls = data.map(p => p.loudnessMax);
  let es = data.map(p => p.energyMax);

  return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
      lMin: Math.min(...ls),
      lMax: Math.max(...ls),
      eMin: Math.min(...es),
      eMax: Math.max(...es)
  };
}

socket.on('to_browser', (raw) => {
  console.log("type de raw :", typeof raw);
  console.log("Message brut reçu de Max/MSP:", raw);

  try {
    let rawData = JSON.parse(raw);

    let parsed = rawData.map(point => ({
      x: parseFloat(point.x),
      y: parseFloat(point.y),
      sampleId: point.sampleId,
      loudnessMax: parseFloat(point.loudnessmax),
      energyMax: parseFloat(point.energymax)
    })).filter(point => !isNaN(point.x) && !isNaN(point.y));

    data = parsed;
    bounds = getBounds(data);

    // définit une fonction pour scaler les valeurs
    const mapRange = (val, inMin, inMax, outMin, outMax) =>
      ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

    // Transform data for Chart.js
    const chartData = data.map(p => {
    const radius = mapRange(p.loudnessMax, bounds.lMin, bounds.lMax, 5, 20);
    const energyHue = mapRange(p.energyMax, bounds.eMin, bounds.eMax, 240, 0); // blue to red
    const color = `hsl(${energyHue}, 100%, 50%)`;
    return {
      x: p.x,
      y: p.y,
      sampleId: p.sampleId,
      radius,
      backgroundColor: color
    };
  });

    //construit le nuage de points
    if (!myChart) {
      myChart= new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Coordinates',
            data: data, 
            backgroundColor: chartData.map(p => p.backgroundColor),
            pointRadius: chartData.map(p => p.radius),
          }]
      },
      options: {
        interaction: {
          mode: 'nearest',
          intersect: false,
          axis: 'xy'
        },
        plugins: {
                  title: {display: false }, 
                  legend: {display: false},
                  tooltip: { enabled: false }, 
                },
        scales: {
                  x: {
                    type: 'linear',
                    min: bounds.xMin - 50,
                    max: bounds.xMax + 50,
                    grid: {display: false}},
                  y: {
                    type: 'linear',
                    min: bounds.yMin - 0.05,
                    max: bounds.yMax + 0.05,
                    grid: {display: false}
                  },
                },

        onHover: (event, chartElements) => {
          const nearestPoints = myChart.getElementsAtEventForMode(
            event,
            'nearest',
            { intersect: false, radius: 30 },
            false
          );
            if (nearestPoints.length) {
                const datasetIndex = chartElements[0].datasetIndex;
                const dataIndex = chartElements[0].index;
                const value = myChart.data.datasets[datasetIndex].data[dataIndex];
                sendOSC("/hover", value.sampleId);
            }
          }
      }
});
    } else {
      myChart.data.datasets[0].data = data;

      // Update axes dynamically
      myChart.options.scales.x.min = bounds.xMin - 50;
      myChart.options.scales.x.max = bounds.xMax + 50;
      myChart.options.scales.y.min = bounds.yMin - 0.05;
      myChart.options.scales.y.max = bounds.yMax + 0.05;
        myChart.update();
    }
  } catch (e) {
    console.error("erreur de parsing :", e);
  }
  });

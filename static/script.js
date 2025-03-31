function sendOSC(address, args) {
    if (socket && socket.connected) {
        socket.emit('osc', { address, args });
    } else {
        console.error("Socket is not connected. Cannot send OSC message.");
    }
}

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

    var multisliderRight = new Nexus.Multislider('#multisliderRight', {
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

    multisliderLeft = new Nexus.Multislider('#multisliderLeft',{
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

const ctx = document.getElementById('myChart');

const data = {
    datasets: [{
      label: 'Scatter Dataset',
      data: [{
        x: -10,
        y: 0
      }, {
        x: 0,
        y: 10
      }, {
        x: 10,
        y: 5
      }, {
        x: 0.5,
        y: 5.5
      }],
      backgroundColor: 'rgb(255, 99, 132)'
    }],
  };

const myChart  = new Chart(ctx, {
    type: 'scatter',
    data: data,
    options: {
        plugins: {
            title: {
              display: false // Hides the title
            },
            legend: {
              display: false // Hides the legend
            },
            tooltip: { enabled: false }, // Disable tooltips
            hover: { mode: null }, // Disable hover effect
            interaction: { mode: null } // Disable interactions
        },
        scales: {
          x: {
            grid: {
                display: false  // Hide X-axis grid
            }
        },
        y: {
            grid: {
                display: false  // Hide Y-axis grid
            }
        },
        },
        onHover: (event, chartElements) => {
          if (chartElements.length > 0) {
              const datasetIndex = chartElements[0].datasetIndex;
              const dataIndex = chartElements[0].index;
              const value = myChart.data.datasets[datasetIndex].data[dataIndex];
              console.log(value);
              var result = [value.x, value.y];
              console.log(result);
              sendOSC("/hover", result);
          }
      }
    }
});



const socket = io("http://127.0.0.1:5000/browser"); // Connect to the /browser namespace

socket.on('connect', function() {
    console.log('Connecté ou pas?');
    socket.emit('message', "Hello from the browser");
});

socket.on('to_browser', (data) => {
    console.log("Message from Max/MSP:", data);
});

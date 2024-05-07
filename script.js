console.log(map_data)
console.log(map_data.Chemical_Space.labels)
// ---------------------------- TMAP -----------------------------------

// Create SVG container
const width = 900;
const height = 900;
const svg = d3.select('#chart')
.attr('width', width)
.attr('height', height);


// Load SVG image
const imageWidth = 900; // Adjust according to your image dimensions
const imageHeight = 900; // Adjust according to your image dimensions
svg.append('image')
.attr('href', 'scatter_plot-2.svg') // Path to your SVG image
.attr('width', imageWidth)
.attr('height', imageHeight);


// Load data from CSV
d3.json('metabolomic.json', {delimiter: ';'}).then(function(data) {


//console.log(data[0].Smiles_GNPS_results); 

//console.log(map_data.Chemical_Space.labels);

var allSmiles = getAllSmilesGNPSResults(data);
console.log(allSmiles);

console.log(allSmiles.length)

let matches = [];

let result = findMatches(data[0].Smiles_GNPS_results, map_data.Chemical_Space.labels) 

console.log(matches);

console.log("Matches:", result.matches);
console.log("Indices:", result.indices);

console.log(map_data.Chemical_Space.x[result.indices])

console.log(map_data.Chemical_Space.x)

// Find the maximum float value
const maxFloat_X = findMaxFloat(map_data.Chemical_Space.x);
console.log("The maximum float value is:", maxFloat_X);

const maxFloat_Y = findMaxFloat(map_data.Chemical_Space.y);
console.log("The maximum float value is:", maxFloat_Y);



// Create scales
const xScale = d3.scaleLinear()
.domain(d3.extent(data, d => parseFloat(d.Chemical_Space_x)))
.range([0, width]);

const yScale = d3.scaleLinear()
.domain(d3.extent(data, d => parseFloat(d.Chemical_Space_y)))
.range([height, 0]);

let myScale_X = d3.scaleLinear()
.domain([0, maxFloat_X])
.range([0, 900]);

let myScale_Y = d3.scaleLinear()
.domain([0, maxFloat_Y])
.range([0, 900]);



console.log(myScale_X(map_data.Chemical_Space.x[result.indices]))
console.log(myScale_Y(map_data.Chemical_Space.y[result.indices]))



// Append a circle for the point
svg.append('circle')
.attr('cx', myScale_X(map_data.Chemical_Space.x[result.indices])) // x-coordinate
.attr('cy', myScale_Y(map_data.Chemical_Space.y[result.indices])) // y-coordinate
.attr('r', 5) // radius of the circle
.attr('fill', 'blue'); // color of the circle, you can change it as needed


// Append a circle for the point
svg.append('circle')
.attr('cx', 450) // x-coordinate
.attr('cy', 450) // y-coordinate
.attr('r', 5) // radius of the circle
.attr('fill', 'blue'); // color of the circle, you can change it as needed



/**

// Create scales
const xScale = d3.scaleLinear()
.domain(d3.extent(data, d => parseFloat(d.Chemical_Space_x)))
.range([0, width]);

const yScale = d3.scaleLinear()
.domain(d3.extent(data, d => parseFloat(d.Chemical_Space_y)))
.range([height, 0]);

// Create circles
const circles = svg.selectAll('circle')
.data(data)
.enter()
.append('circle')
.attr('cx', d => xScale(parseFloat(d.Chemical_Space_x)))
.attr('cy', d => yScale(parseFloat(d.Chemical_Space_y)))
.attr('r', 2)
.style('fill', 'grey'); // You can set the color based on your data

*/

// Create zoom behavior
const zoom = d3.zoom()
.scaleExtent([1, 10]) // Limit zooming between 1x and 10x
.on('zoom', zoomed);

svg.call(zoom);

// Define zoom function
function zoomed(event) {
const { transform } = event;
circles.attr('transform', transform);
}



// ---------------------------- Matrix Visualisierung -----------------------------------


/**

    // JavaScript code for the second graph
    var data2 = [5, 10, 15, 20, 25];

    const svg2 = d3.select('#chart2')
.attr('width', width)
.attr('height', height);

svg2.selectAll("circle")
    .data(data2)
    .enter()
    .append("circle")
    .attr("cx", (d, i) => i * 80 + 40)
    .attr("cy", (d) => 150 - d * 2)
    .attr("r", (d) => d * 2)
    .attr("fill", "red");

    **/


});



function findMatches(mainString, arrayOfStrings) {
let matches = [];
let indices = [];
arrayOfStrings.forEach(function(string, index) {
if (string.includes(mainString)) {
    matches.push(string);
    indices.push(index);
}
});
return { matches, indices };
}


function findMaxFloat(arr) {
let max = -Infinity;
for (let i = 0; i < arr.length; i++) {
if (typeof arr[i] === 'number' && !isNaN(arr[i])) {
if (arr[i] > max) {
max = arr[i];
}
}
}
return max;
}


// function that returns all the SMILES codes in an array

function getAllSmilesGNPSResults(data) {
var smilesArray = []; // Initialize an empty array to store Smiles_GNPS_results

// Check if data is an array and not empty
if (Array.isArray(data) && data.length > 0) {
// Iterate through each object in the data array
data.forEach(function(item) {
    // Check if the object has the Smiles_GNPS_results property
    if (item.hasOwnProperty('Smiles_GNPS_results')) {
        // Push the Smiles_GNPS_results to the array
        smilesArray.push(item.Smiles_GNPS_results);
    }
});
} else {
console.log("Data is either not an array or is empty.");
}

return smilesArray; // Return the array containing all Smiles_GNPS_results
}





javascript:(function(){var script=document.createElement('script');script.onload=function(){var stats=new Stats();document.body.appendChild(stats.dom);requestAnimationFrame(function loop(){stats.update();requestAnimationFrame(loop)});};script.src='https://mrdoob.github.io/stats.js/build/stats.min.js';document.head.appendChild(script);})()

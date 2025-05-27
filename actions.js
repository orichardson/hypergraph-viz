/*
A brief list of the things we want to be able to do, as "actions".



STATIC actions; based on selection, do somethign. 
 - pin / unpin nodes
 - start / end force simulation (for nodes in selection)
 - compute things, e.g., flows
 - togle display modes and properties
 - loosen / tighten arcs
 - rename 
 - rigidify structures
 
global actions (special case of above):
 - load / save
 - undo
 - re-layout

INITIATE actions (over time with mouse):
 - start box select
 - start drawing
 - move and scale operations
*/

function noop() {};
function pin(selection) {
	for (let n of selection) {
		n.fx = x;
		n.fy = y;		
	}	
}



ACTIONS = [
	// anchor nodes or linkednodes
	{ name: 'pin',
		available: () => true,
		exec : pin,
	},
	{	name : 'unpin',
		available: () => true,
		exec: noop
	}
];

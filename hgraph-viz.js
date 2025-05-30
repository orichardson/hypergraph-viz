//A web-page opened via the file:// protocol cannot use import / export.
// import defaultExport from '/link-modified.js';

console.log("hgraph-viz.js");
hypergraph = {
	nodes : ['A', 'B', 'C', 'D'],
	hedges : {
		p0: [['B', 'C'], ['A']],
		$p_2$: [['A', 'D'], ['B']],
		p4: [['A', 'D'], ['C']],
		p6: [['B', 'C'], ['D']]
	}
};


async function renderMathToSVG(latexString) {
		// written by chatgpt
  const node = await MathJax.tex2svgPromise(latexString, { display: false });
  const svg = node.querySelector('svg');
  svg.removeAttribute('style');  // Remove inline styles that interfere with D3
  return svg;
}


// Main code 
$(function() {
	// resize to full screen
	let canvas = document.getElementById("canvas"),
		svg = d3.select("#svg");
	let context = canvas.getContext("2d");

	function resizeCanvas() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		if(typeof simulation != "undefined") {
			for(let hg of hgs) {
			// hg.sim.force('center').x(canvas.width/2);
			// hg.sim.force('center').y(canvas.height/2);
				hg.sim.alpha(1).restart();
				hg.tick();
			}
		}
		// hg.tick();
	}
	window.addEventListener('resize', resizeCanvas, false);
	resizeCanvas()
	
	let mode = $('#drag-mode-toolbar button.active').attr('data-mode');
	
	$('#drag-mode-toolbar button').on('click', function() {
		$('#drag-mode-toolbar button').removeClass("active");
		$(this).addClass('active');
		mode = $(this).attr('data-mode');
		// console.log('new mode: ', mode);
	});
	
	
	let mouse = { w : 0, h: 0 };
	
	hg = HGView(hypergraph, mouse);
	hgs =  [ hg ];
	
		
	$('#save-button').click(function(e){
		download_JSON(hg.state, 'hypergraph');
	});
	$('#load-button').click(function(e){
		$('#fileupload').click();
	})
	$('#fileupload').on('change', function(evt){
		// console.log(evt);
		const reader = new FileReader();
		reader.onload = function(e) {
			// console.log(e);
			let ob = JSON.parse(e.target.result);
			// load_hypergraph(ob);
			hg.load(ob);
			// console.log("LOADED HYPERGRAPH:", ob);
		};
		reader.readAsText(evt.target.files[0]);
	})	
	
	// temporary states, for actions
	var temp_link = null;	
	var popup_process = null;
	var popped_up_link = null;
	var action = {};
 
	//##  Next, Updating + Preparing shapes for drawing, starting with a 
	// helpful way of getting average position by node labels.  
	function redraw() {
		context.save();
		context.clearRect(0, 0, canvas.width, canvas.height);
		
		context.lineWidth = 1.5;
		context.strokeStyle = "black";

		context.lineCap = 'round';
		// context.setLineDash([]);
		
		for( let M of hgs ) {
			M.draw(context);
		}
		
		if(temp_link) {
			let midpt = (temp_link.x == undefined) ? undefined : vec2(temp_link);
			let tlpath = hg.compute_link_shape(temp_link.srcs, temp_link.tgts, midpt);
			
			context.lineWidth = 3;
			context.strokeStyle = "rgba(255,255,255,0.4)";
			context.stroke( tlpath )
			
			context.lineWidth = 1.5;
			context.strokeStyle = "black";
			context.stroke( tlpath )
		}
		context.restore();
		context.save();
		// Draw Selection Rectangle
		context.globalAlpha = 0.2;
		if( action.type == 'box-select' && action.start) {
			// console.log(...corners2xywh(select_rect_start, select_rect_end))
			// context.save();
			context.fillStyle="orange";
			
			// context.fillRect(select_rect_start.x, select_rect_start.y, select_rect_end.x, select_rect_end.y);
			// let [xmin,ymin,w,h] = corners2xywh(select_rect_start, select_rect_end);
			context.fillRect(...corners2xywh(action.start, action.end));
			// context.stroke();
			// context.restore();
		}
		
		
	}
	hg.repaint_via(redraw);
	
	// in actions.js, a list ACTIONS is defined; start by adding buttons
	for( let a of ACTIONS) {
		b = $('<button class="btn action--'+a.name+'" />'+a.name+'</button>');
		b.on('click', function(){ console.log("PRESS!", a, a.name); a.exec(); });
		$('#action-panel').append(b);
	}
	
	// currently unusued; maybe delete?
	function action_panel_update() {
		$('#action-panel button').each(function() {
			// TODO: enable / disable button
		});
	}
	
	d3.select(canvas).call(d3.drag()
			.container(canvas)
			.clickDistance(10)
			.subject(function(event) {
					// console.log("drag.subject passed : ", event)
					if (action.type == 'box-select') return true;
					// else if(action.type == '')
					if (mode == 'draw' && temp_link) return undefined;
					// else {

					let o = hg.pickN(event);
					if(o) return o;
					let ln = hg.pickL(event,6,true);
					if(ln) return ln;

					//  if in draw mode, 
					//  create new link source (empty srcs) beginning at target
					if(mode == 'draw') {
						let lo = {link: linkobject(['templink', [[],[]]]), x: event.x, y: event.y};
						return lo;
					}
					
					if( mode == 'move' ) {
						action = { type : 'box-select'};
						return true;
					}
					// }
				})
			.on("start", dragstarted)
			.on("drag", dragged)
			.on("end", dragended)
		);
	function dragstarted(event) {
		if(popup_process) clearTimeout(popup_process);
			
		if (action.type == 'box-select') {
			action.start = vec2(event);
			action.end = vec2(event);
			hg.tick();
		}
		else if (mode == 'draw') {
			if(event.subject.link)  { // if it's an edge
				let l = event.subject.link;
				l.display = false; // don't display until it's cancelled or released. 
				temp_link = linkobject(['<TEMPORARY>', [l.srcs, ["<MOUSE>"].concat(l.tgts)]]);
				temp_link.based_on = l;
				temp_link.x = event.subject.x;
				temp_link.y = event.subject.y;
				// temp_link.unit
			} else { // drag.subject is a node.
				temp_link = linkobject(['<TEMPORARY>', [[event.subject.id], ["<MOUSE>"]]]);
			}
			hg.tick();
		}
		else if(mode == 'move') {
			// if there are no other drag handlers currently firing.
			// apparently useful mostly in multi-touch scenarios.
			if (!event.active) hg.sim.alphaTarget(0.5).restart();
			if(event.subject.link)  {// it's a link
				event.subject.initial_offset = event.subject.offset;
			} else {  // if it's a node
				event.subject.fx = event.subject.x;
				event.subject.fy = event.subject.y;
				// event.subject.anchored = false;
				hg.align_node_dom();
			}
		}
		
	}
	function dragged(event) {
		// console.log(event);
		if (action.type == 'box-select') {
			action.end = vec2(event);
			hg.tick();
		}
		else if(mode == 'move') {
			if(event.subject.link)  { // if it's an edge
				// console.log(event);
				// event.subject.offset[0] += event.dx;
				// event.subject.offset[1] += event.dy;
			} else {// it's a node
				event.subject.fx = event.x;
				event.subject.fy = event.y;
			}
		} 
		else if (mode == 'draw') {
			// mouse_pt = vec2(event);
			// hg.lookup["<MOUSE>"] = {x: event.sourceEvent.x,
			// 				y: event.sourceEvent.y,
			// 				w:1,h:1
			mouse.x = event.sourceEvent.x;
			mouse.y = event.sourceEvent.y;
							// setting to negative 9 means the arrow is only shortened 1 pixel.
							// w: -9, h: -9
						// };
			// hg.tick();
			redraw();
		}
	}
	function dragended(event) {
		if(action.type == 'box-select') {
			action.end = vec2(event);
			action.shift = event.sourceEvent.shiftKey;
			hg.handle(action)
			
			select_rect_start = null;
			select_rect_end = null;
			action = {};
			redraw();
		}
		else if (mode == 'draw' && temp_link) {
			hg.handle({
				type : "edge-stroke",
				temp_link : temp_link,
				endpt: {x : event.sourceEvent.x, y : event.sourceEvent.y},
				// source_link : event.subject.link
			});
			temp_link = null;
		}
		else if(mode == 'move') {
			if (!event.active){
				// hg.sim.alpha(1.2).alphaTarget(0).restart();	
				hg.sim.alphaTarget(0);
			} 
			
			if(event.subject.link)  { // if it's an edge
				// console.log("FINISH DRAG", event);
				// event.subject.offset = [ 
				// 		event.subject.initial_offset[0] + event.,
				// 		event.subject.initial_offset[1] + event.dy ]
			} else {// it's a node	
				if(event.sourceEvent.shiftKey){
					event.subject.anchored = true;
					hg.align_node_dom();
				}

				if(!event.subject.expanded 
					// && hg.sim_mode === "all"
					&& !event.subject.anchored
					) {
					event.subject.fx = null;
					event.subject.fy = null;
				}
			}
		}
	}
	
	function set_mode(mode) {
		$("#drag-mode-toolbar button[data-mode='"+mode+"']").click();
	}
	
	canvas.addEventListener("dblclick", function(e) {
		let obj = hg.pickN(e), link = hg.pickL(e);
		if(obj) { // rename selected node
			// EXPANDING CODE 
			/*
			if(!obj.expanded) {
				hg.sim.stop();
				obj.expanded = true;
				obj.old_wh = [obj.w, obj.h];
				// [obj.w, obj.h] = [550,250];
				[obj.w, obj.h] = [200,150];
				[obj.fx, obj.fy] = [obj.x, obj.y];
				hg.sim.alpha(2).alphaTarget(0).restart();
			
				for(let ln of hg.linknodes) {
					// if l.srcs or l.tgts includes n,
					// then set strength to zero?
					// set distance?
				}
			}
			else {
				obj.expanded = false;
				[obj.w, obj.h] = obj.old_wh ? obj.old_wh : [initw,inith];
				delete obj.fx
				delete obj.fy;
				hg.sim.alpha(2).alphaTarget(0).restart();
			}
			hg.align_node_dom();*/
			
			
			//RENAMING NODE CODE
			console.log(obj);
			let name = promptForName("Enter New Variable Name", obj.id, hg.all_node_ids);
			if(!name) return;
			hg.rename_node(obj.id, name);
			// hg.nodes 
			
			document.getElementById('node-properties').showModal();
			
		} else if(link) { // rename selected cpd
			
			
		} else { // nothing selected; create new variable here.
			setTimeout(function() {
				let name = promptForName("Enter A Variable Name",
					// fresh_node_name(), 
					hg.fresh_node_name(),
					hg.all_node_ids);
				if(!name) return;
				
				newtgt = hg.new_node(name, e.x, e.y);
				if(temp_link) {
					// todo: fold out this functionality, shared with click below.
					new_tgts = temp_link.tgts.slice(1);
					new_tgts.push(newtgt.id);
					hg.new_link(temp_link.srcs, new_tgts, fresh_label(), [temp_link.x, temp_link.y]);
					temp_link = null;
				}
				hg.tick();
			}, 10);
		}		
		// if(e.ctrlKey || e.metaKey) {
		// }
	});
	canvas.addEventListener("click", function(e) {
		// ADD NEW NODE
		// if(e.ctrlKey || e.metaKey) {
		if( temp_link ) {
			// let newtgt = hg.pickN(e);
			// if(!newtgt && mode == 'draw') {
			// 	newtgt = new_node(fresh_node_name(), e.x, e.y);
			// }
			// if(newtgt) {
			// 	if(!e.shiftKey) {
			// 		new_tgts = temp_link.tgts.slice(1);
			// 		new_tgts.push(newtgt.id);
			// 		new_link(temp_link.srcs, new_tgts, fresh_label(), [temp_link.x, temp_link.y]);
			// 		temp_link = null;
			// 	}
			// 	else {
			// 		temp_link.tgts.push(newtgt.id);
			// 	}
			// }
			// console.log("IN CLICK W/ TEMP LINK")
			hg.handle({
				type : "edge-stroke",
				temp_link : temp_link,
				endpt: {x : e.x, y : e.y},
				// source_link : event.subject.link
			});
			temp_link = null;

		} else if(action.type == 'move') {
			// mouse_end = vec2(lookup['<MOUSE>']);
			mouse_end = vec2(mouse);
			
			action.targets.forEach(n => {
				[n.x, n.y] = addv(n.old_pos, mouse_end, scale(action.mouse_start, -1)); 
				if(n.anchored || (hg.sim_mode === "linknodes only" && !n.link)) {
					[n.fx, n.fy] = [n.x,n.y];
				}
				delete n.old_pos;
			});
			
			function adjust_seps(ln, n, nsibls, isloop) {
				// ln.sep[n] = mag(subv(vec2(ln), vec2(lookup[n])));
				let p = vec2(ln), 
					q = vec2(lookup[n]),
					wh = [lookup[n].w, lookup[n].h];
				let cur_sep = mag(subv(sqshortened_end(q,p,[ln.w,ln.h]),
									 sqshortened_end(p,q, wh) ));
				let cur_sep_want = ln.sep && ln.sep[n]? ln.sep[n] :
				 	default_separation(nsibls,isloop)
				
				if(cur_sep > cur_sep_want * STRETCH_FACTOR ||
					 	cur_sep < cur_sep_want / STRETCH_FACTOR) 
					ln.sep[n] = cur_sep;
			}
			
			for(let ln of hg.linknodes) {
				if(action.targets.includes(ln)) {
					ln.sep = {}
					// ## TEMPORARILY COMMENTED OUT; KEEP SEPS SAME
					// for(let n of ln.link.srcs) 
					// 	adjust_seps(ln, n, ln.link.srcs.length, ln.link.tgts.includes(n))
					// 
					// for(let n of ln.link.tgts) 
					// 	adjust_seps(ln, n, ln.link.tgts.length, ln.link.srcs.includes(n))
				}
			}
			// hg.sim.force("bipartite").links(mk_bipartite_links(linknodes));
			hg.update_simulation();
			// hg.update_simulation();
			// for(let n of action.targets) {
			// 
			// }
			action = {};
			hg.restyle_nodes();
			
		} else if(mode == 'move') { // selection in manipulate mode
			hg.point_select(e, !e.shiftKey);
		}
		// else if(mode == 'select'){
		// 	let link = pickL(e);
		// 	if(link) link.selected = !link.selected;
		// 	// console.log("[Click] " + (link.selected?"":"un")+"selecting  ", link.label, e);
		// 	redraw();
		// }
	});
	window.addEventListener("keydown", function(event){
		// console.log(event);
		
		if(event.key == 'Escape'){ // cancel //
			if ( temp_link ) {
				if(temp_link.based_on ) 
					temp_link.based_on.display = true;
				
				temp_link = null;
				redraw();
			}
			else if( action.type == 'move') {
				action.targets.forEach(n => {
					[n.x, n.y] = n.old_pos;
					delete n.old_pos;
				});
			}
			action = {};
			hg.tick();
		}
		else if (event.key == 'a') {
			hg.select_all();
		}
		else if (event.key.toLowerCase() == 'b') {
			// $("#drag-mode-toolbar button[data-mode='select']").click();
			// set_mode('select');
			
			action = {
				type: "box-select",
				end : null,
				start : null
			}
		}
		else if (event.key.toLowerCase() == 't') {
			// start creating arrows.
			// 1. Create new arrow from selection at tail
			src = hg.selected_node_ids
			// src = nodes.filter( n => n.selected ).map( n => n.id );
			// lab = fresh_label();
			// temp_link = new_link(src, ['<MOUSE>'], "<TEMPORARY>");
			temp_link = linkobject(['<TEMPORARY>', [src, ["<MOUSE>"]]], undefined)
			if( src.length == 0) {
				temp_link.x = mouse.x
				temp_link.y = mouse.y
			}
			// set_mode('draw');
			// links.push(temp_link);
		}
		else if (event.key == ' ') {
			event.preventDefault();
			// hg.sim.alphaTarget(0.05).restart();
			
			// if we're only simulating linknodes, then
			// we still want to un-fix selected nodes on space to reorganize them.
			action = {
				type : "local-simulation",
				targets : hg.nodes.filter(n => n.selected)
			};
			if(hg.sim_mode === "linknodes only") { 
				action.targets.forEach(n => {delete n.fx; delete n.fy;})
			}
			
			hg.sim.alphaTarget(1.5).restart();
			// hg.sim.alpha(2).alphaTarget(0).restart();
			
			if(mode == 'move') {
			}
			if(mode == 'select') {
				// TODO shift selection to backup selection (red color)
			}
		}
		else if (event.key.toLowerCase() == 'x') {
				hg.delete_selection();
		}
		else if (event.key == 'd') {
			set_mode("draw");
		}
		else if (event.key == 'm') {
			set_mode("move");
		}
		else if (event.key == "g") {
			// hg.sim.stop();
			hg.sim.stop();
			// move selection with mouse
			
			action = {
				type : "move", 
				mouse_start : vec2(mouse),
				targets: hg.nodes.filter(n => n.selected).concat(hg.linknodes.filter(ln => ln.link.selected)) 
			}
			
			action.targets.forEach( n => {
				n.old_pos = vec2(n);
			});
		}
		else if (event.key == "s") {
			
		}

	});
	window.addEventListener("keyup", function(event){
		if(action.type === "local-simulation" && event.key == ' ') {
			hg.sim.alphaTarget(0);
			if(hg.sim_mode === "linknodes only") { 
				action.targets.forEach( n => { [n.fx,n.fy] = [n.x,n.y]; });
			}
		}		
	});
	canvas.addEventListener("wheel", function(e) {
		// console.log("canvas", e.wheelDelta );
		// lover = pickL(e, width=10);
		
		//# code to change LINE WIDTH
		// if(lover.lw == undefined) lover.lw=2;
		// lover.lw = (lover.lw + sgn(e.wheelDelta) );
		
		
		hg.tick();
		// console.log(lover);
	});
	window.addEventListener("mousemove", function(e) {
		// mouse_pt = [e.x, e.y];
		// lookup["<MOUSE>"] = {x : e.x, y: e.y, w:0,h:0};
		// console.log("HI");
		// hg.lookup["<MOUSE>"] = {x : e.x, y: e.y, w:0,h:0};
		
		mouse.x = e.x;
		mouse.y = e.y;
		
		if(temp_link) redraw();
		
		if(popped_up_link && !hg.picksL(e, popped_up_link, 10)) {
			delete popped_up_link.lw;
			popped_up_link = null;
			hg.tick();
		}
		
		if(popup_process) clearTimeout(popup_process);
	
		if( !popped_up_link) {
			popup_process = setTimeout(function() {
				let l = hg.pickL(e, 10);
				popped_up_link = l;

				if(l) {
					l.lw = 5;
					hg.tick();
				}
			}, 100);
		}

		// if ( mode == 'move'  && action) {
		if(action.type == 'move') {
			action.targets.forEach(n => {
				[n.x, n.y] = addv(n.old_pos, vec2(e), scale(action.mouse_start, -1)); 
			});
			// console.log(action.targets);
			hg.restyle_nodes();
			// midpoint_aligning_force(1);
			hg.tick();
			// TODO move selection, like ondrag below
		}
	})
});

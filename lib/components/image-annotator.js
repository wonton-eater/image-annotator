const $ = require('jquery');

// dev tools
const print = require('./../utils/print');
const guidGenerator = require('./../utils/guid-generator');

// styling tools
require('rangeslider.js');
require('hammerjs');
require('materialize-css');

// models
const Marker = require('./../models/marker');

// interface components
const ImageMiniMap = require('./image-mini-map');
const Timer = require('./../utils/timer');
const CrowdCurioClient = require('crowdcurio-client');
const IntroJS = require('intro.js');

window.materializeIncluded = true;


/**
 * The ImageAnnotator Base function / constructor.
 */
function ImageAnnotator() {
  /*  external reference for the object */
  surface = this;

  this.client = new CrowdCurioClient();

  /*  establish the data structures */
  this.markers = {};
  this.measurements = {};
  this.known_annotations = {};

  /*  internal members */
  this.map = new ImageMiniMap();

  /*  data collection variables */
  this.selection = null;
  this.rotationDegree = 0;
  const zoomAspect = 0;


  /* default settings */
  this.timeOfLastDrag = 0;
  this.timeout = 15000;
  this.mode = 'issues';
  this.step = 0;
  this.hoveringOnMarker = false;

  this.movingMarker = false;
  this.shifting = false;
  this.intercepting = true;

  /* measure variables */
  this.dragmode = true;
  this.region = '';
  this.dragging = false;
  this.canvas = null;
  this.ctx = null;


  // Meaure column item pagination
  this.page_size = 1;
  this.fade_time = 200;
  this.slide_time = 0;
  this.max_pages = 10;
  this.animate1 = true;
  this.show_last = true;

  // storage for state switching
  this.states = {};
  this.required_task = null;
  this.practice_task = null;

  // modal reference storage
  this.modals = {};

  // holds the current data object
  // primarily used to access the data object's name
  this.data = {};

  this.stateLoaded = false;
  this.dataLoaded = false;
}


/**
 *
 * @param {Object} config : a configuration specification for the interface
 * for more details on supported configuration, please visit the annotator repository at:
 *  - https://github.com/CrowdCurio/image-annotator
 */
ImageAnnotator.prototype.initialize = function (config) {
  const that = this;
  const annotations_url = 'https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/greenstone/taus.json';
  /* make a request for the known annotations */
  $.getJSON(annotations_url)
    .done((data) => {
      // console.log("Annotations retrieved.")
      that.known_annotations = data;
    })
    .fail((d, textStatus, error) => {
      console.error(`getJSON failed, status: ${textStatus}, error: ${error}`);
    });

  /* render the elements before adding handlers */
  this.render(config);

  /* init the crowdcurio client */
  this.client.init({
    task: window.task,
    user: window.user,
    experiment: window.experiment,
    condition: window.condition,
    configuration: config,
  }).then(() => {
    print('Initialization finished.');
    that.postInitialize();
  });

  if ('collaboration' in config) {
    if ('active' in config.collaboration) {
      if (config.collaboration.active) {
        /* override the receiving function for interface events */
        this.client.task_session.setListeners({
          save: that.handleInterfaceUpdateSave, // Specify handler for save events.
          delete: that.handleInterfaceUpdateDelete, // Specify handler for delet events.
        });
      }
    }
  }

  // close the loading modal
  this.modals.loading_modal.modal('open');
};

ImageAnnotator.prototype.postInitialize = function () {
  const that = this;
  // define an image w/ load events
  global.oImg = new Image(); // $('.subject');
  const Img = $('.subject');
  global.oImg.onload = function () {
    Img.removeAttr('style');

    /*  compute the thumbnail size */
    let width = oImg.naturalWidth,
      height = oImg.naturalHeight,
      maxWidth = 180,
      maxHeight = 240;

    /*  check if width or height is larger and modify appropriately */
    if (width > maxWidth) {
      height = Math.floor(maxWidth * height / width);
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = Math.floor(maxHeight * width / height);
      height = maxHeight;
    }

    /*  set the thumbnail size / height / src */
    $('#thumb').attr({ width, height, src: oImg.src });

    /* show the map */
    $('#map').fadeIn();

    that.dataLoaded = true;

    if ('collaboration' in config) {
      if ('active' in config.collaboration) {
        if (config.collaboration.active) {
          // close the loading modal
          if (that.statedLoaded) {
            that.modals.loading_modal.modal('close');

            // close the modal
            that.modals.fetching_task_modal.modal('close');
          }
        }
      }
    } else {
      // close the modal
      that.modals.loading_modal.modal('close');
      that.modals.fetching_task_modal.modal('close');
    }

    // load based off of whether they've seen the tutorial or not
    // var seenTutorial = localStorage.getItem('crowdcurio-tau-seen-tutorial');
    // if(seenTutorial){
    //     // check for surveys
    //     if('survey' in config){
    //         if('efficacy' in config['survey']){
    //             if(config['survey']['efficacy'] == true){
    //                 setTimeout(function(){that.modals['survey_efficacy_modal'].modal('open')}, 500);
    //             }
    //         }
    //     }
    // } else {
    //     setTimeout(function(){that.loadTutorial(config); }, 500);
    // }
    const seenTutorial = localStorage.getItem('crowdcurio-tau-seen-tutorial');
    if (!(seenTutorial)) {
      setTimeout(() => {
        that.modals.tutorial_modal.modal('open');
      });
    }
  };

  /*  initialize the mini map */
  surface.map.initMap();

  /* attach handlers for most of the UI components */
  this.attachHandlers();


  /* fetch the tasks from the server */
  if (global.DEV) {
    /* get the first item in the queue and it's class label */
    this.client.getNextTask('required', function (task) {
      console.log('Task Fetched:');
      console.log(task);

      if (Object.keys(task).length === 0 && task.constructor === Object) {
        if (window.experiment === undefined) {
          that.client.update('taskmember', {
            id: window.task_member,
            seen_all: true,
          }, (result) => {
            console.log('After update:');
            console.log(result);
          });

          alert('Whoa! You finished all the tasks.');
        } else {
          // close the modal
          that.modals.loading_modal.modal('close');

          // alert the user that they're out of tasks to see
          that.modals.finished_modal.modal('open');

          setTimeout(() => {
            // otherwise, increment the user's experiment workflow
            // incrementExperimentWorkflowIndex(csrftoken, window.user, window.experiment);
          }, 1000);
        }
      } else {
        /* update the source of the image and trigger the onload event */
        that.states.required = { task, markers: {}, map: { x: 0, y: 0 } };
        that.client.setData(task.id);
        that.data = task;
        oImg.src = task.url;
        $('.subject').attr('src', task.url);

        /* get the available practice tasks for the user */
        this.client.getNextTask('practice', (task) => {
          if (Object.keys(task).length === 0 && task.constructor === Object) {
            // click the practice button artifically and disable it
            const practice_btn = $('#practice-room-btn');
            practice_btn.addClass('disabled');
          } else {
            // we have a valid practice task, so update the UI's practice task reference
            that.practice_task = task;
          }
        });

        // switch the mode back
        ms.changeMode(config.mode);
      }
    });
  } else {
    // use the task queue
    /* get the first item in the queue and it's class label */
    this.client.getNextTask('required', (task) => {
      // check if a task was given back to us.
      // if not, update
      if (Object.keys(task).length === 0 && task.constructor === Object) {
        if (window.experiment === undefined) {
          that.client.update('taskmember', {
            id: window.task_member,
            seen_all: true,
          }, (result) => {
            // close the modal
            that.modals.loading_modal.modal('close');

            // alert the user that they're out of tasks to see
            that.modals.finished_modal.modal('open');

            setTimeout(() => {
              window.location.href = '/';
            }, 5000);
          });
        } else {
          // close the modal
          that.modals.loading_modal.modal('close');

          // alert the user that they're out of tasks to see
          that.modals.finished_modal.modal('open');

          setTimeout(() => {
            // otherwise, increment the user's experiment workflow
            alert('Heeeey.');
            // incrementExperimentWorkflowIndex(csrftoken, window.user, window.experiment);
          }, 1000);
        }
      } else {
        /* update the source of the image and trigger the onload event */
        that.states.required = { task, markers: {}, map: { x: 0, y: 0 } };
        that.client.setData(task.id);
        that.data = task;
        global.oImg.src = task.url;
        $('.subject').attr('src', task.url);

        // handle collaboration
        if (config.collaboration) {
          if (config.collaboration.active) {
            that.client.listAll('annotation', {
              data: task.id,
              experiment: window.experiment,
              condition: window.condition,
              task: window.task,
              task_session: that.client.task_session.task_session,
            }, (state) => {
              print('State: ');
              console.log(state);
              that.loadState(state);
              that.stateLoaded = true;

              // update the state of the task session
              that.client.update('tasksession', {
                id: that.client.task_session.task_session,
                channel_name: that.client.task_session.channel_name,
                data: { type: 'Data', id: task.id },
              }, () => {
                // print("Task session updated.")
              });

              that.modals.loading_modal.modal('close');
            });
          }
        } else { // otherwise, hide the modals
          that.stateLoaded = true;

          if (that.dataLoaded) {
            that.modals.loading_modal.modal('close');
            that.modals.fetching_task_modal.modal('close');
          }
        }


        /* get the available practice tasks for the user */
        that.client.getNextTask('practice', (task) => {
          // if nothing came back, disabled the practice button
          if (Object.keys(task).length === 0 && task.constructor === Object) {
            // click the practice button artifically and disable it
            const practice_btn = $('#practice-room-btn');
            practice_btn.addClass('disabled');
          }

          print(`Practice Tasks: ${that.client.router.queues.practice.total}`);
          const ele = $('.practice-tasks-number-remaining');
          ele.empty();
          ele.text(that.client.router.queues.practice.total);
          that.states.practice = { task, markers: {}, map: { x: 0, y: 0 } };
        });

        // switch the mode back
        ms.changeMode(config.mode);
      }
    });
  }

  /* attach the handler for hte submit / next-task button */
  $('#next-button').click(function (e) {
    // 1. validation
    const i = $('.marker').length;
    if (i === 0) { alert('Error: You cannot submit without making annotations!'); return; }

    // close the modal
    that.modals.fetching_task_modal.modal('open');

    // 2. hide the map
    $('#map').fadeOut();

    // 2.5. calculate accuracy
    that.calculateAccuracy(that.data.name.split('-')[0]);

    // 3. save the new response
    if (!global.DEV) {
      that.client.create('response', {
        content: that.markers,
      }, (result) => {
        console.log('Result after save:');
        console.log(result);

        // reset the surface
        ms.resetSurface();

        // get the next task
        that.client.getNextTask('required', (task) => {
          console.log('Next task Fetched:');
          console.log(task);

          if (Object.keys(task).length === 0 && task.constructor === Object) {
            if (window.experiment === undefined) {
              that.client.update('taskmember', {
                id: window.task_member,
                seen_all: true,
              }, (result) => {
                // close the modal
                that.modals.loading_modal.modal('close');

                // alert the user that they're out of tasks to see
                that.modals.finished_modal.modal('open');

                setTimeout(() => {
                  window.location.href = '/';
                }, 5000);
              });
            } else {
              // close the modal
              that.modals.loading_modal.modal('close');

              // alert the user that they're out of tasks to see
              that.modals.experiment_complete_modal.modal('open');

              setTimeout(() => {
                // otherwise, increment the user's experiment workflow
                incrementExperimentWorkflowIndex(csrftoken, window.user, window.experiment);
              }, 1000);
            }
          } else {
            /* update the source of the image and trigger the onload event */
            that.states.required = { task, markers: {}, map: { x: 0, y: 0 } };
            that.client.setData(task.id);
            that.data = task;
            global.oImg.src = task.url;
            $('.subject').attr('src', task.url);

            if (config.collaboration) {
              if (config.collaboration.active) {
                // update the state of the task session
                that.client.update('tasksession', {
                  id: that.client.task_session.task_session,
                  channel_name: that.client.task_session.channel_name,
                  data: { type: 'Data', id: task.id },
                }, () => {
                  // print("Task session updated.")
                });
              }
            }

            // close the modal
            that.modals.fetching_task_modal.modal('close');

            setTimeout(() => {
              that.modals.survey_efficacy_modal.modal('open');
            }, 500);

            // switch the mode back
            ms.changeMode(config.mode);
          }
        });
      });
    } else {
      console.log('Simulating a save to the server .... Saved!');
      // clear annotations and reset the surface
      ms.resetSurface();

      // get the next task
      const task = ms.router.simulateGetNextTask();

      if (task.length !== 0) {
        global.oImg.src = task.url;
        $('.subject').attr('src', task.url);
        this.artifact_id = task.id;
      } else {
        alert("Hey! You're out of tasks, Bucko!");
      }

      // close the modal
      that.modals.fetching_task_modal.modal('close');
    }
  });

  /* attach the handler for the practice next-task button */
  $('#next-practice-button').click(function (e) {
    // 1. validation
    const i = $('.marker').length;
    if (i === 0) { alert('Error: You cannot submit without making annotations!'); return; }

    // close the modal
    that.modals.fetching_task_modal.modal('open');

    // 2. hide the map
    $('#map').fadeOut();

    // 3. save the new response
    if (!global.DEV) {
      that.client.create('response', {
        content: that.markers,
      }, (result) => {
        console.log('Result after save:');
        console.log(result);

        // reset the surface
        ms.resetSurface();

        // update the number of practice tasks available
        const ele = $('.practice-tasks-number-remaining');
        const practice_tasks = parseInt(ele.text());
        if (practice_tasks > 0) {
          ele.text(practice_tasks - 1);
        }

        // get the next task
        that.client.getNextTask('practice', (task) => {
          console.log('Next task Fetched:');
          console.log(task);

          if (Object.keys(task).length === 0 && task.constructor === Object) {
            // close the modal
            that.modals.fetching_task_modal.modal('close');

            // start forcing the user back into the required state
            setTimeout(() => {
              that.modals.practice_finished_modal.modal('open');
              setTimeout(() => {
                that.modals.practice_finished_modal.modal('close');

                // click the practice button artifically and disable it
                let practice_btn = $('#practice-room-btn');
                practice_btn.click();
                practice_btn.addClass('disabled');
              }, 5000);
            }, 100);
          } else {
            /* update the source of the image and trigger the onload event */
            that.states.practice = { task, markers: {}, map: { x: 0, y: 0 } };
            that.client.setData(task.id);
            that.data = task;
            oImg.src = task.url;
            $('.subject').attr('src', task.url);

            // switch the mode back
            ms.changeMode(config.mode);
            $('#practice_submission_toggles').fadeOut(500, () => {
              $('#practice_validation_toggles').fadeIn(500, () => {});
            });
          }
        });
      });
    } else {
      console.log('Simulating a save to the server .... Saved!');
      // clear annotations and reset the surface
      ms.resetSurface();

      // get the next task
      const task = ms.router.simulateGetNextTask();

      if (task.length !== 0) {
        global.oImg.src = task.url;
        $('.subject').attr('src', task.url);
        this.artifact_id = task.id;
      } else {
        alert("Hey! You're out of tasks, Bucko!");
      }

      // close the modal
      that.modals.fetching_task_modal.modal('close');
    }
  });

  /* attach the handler for the practice validation button */
  $('#validate-practice-button').click(() => {
    // load the known annotations onto the annotation surface
    that.loadKnownMarkers(that.data.name.split('-')[0]);

    //
    const practice_submission_window = $('#practice_submission_toggles');
    $('#practice_submission_toggles').fadeIn();
  });

  // before we set the mode, update the interface's mode
  if ('mode' in config) {
    ms.changeMode(config.mode);
  } else {
    ms.changeMode('somethingelse');
  }
};


/**
 * Attaches handlers to all elements of the interface.
 */
ImageAnnotator.prototype.attachHandlers = function () {
  const that = this;
  /*  draggability for the fragment image */
  $('#fragment_container').draggable({
    disabled: false,
    distance: 3, /* at least 3 pixels to trigger the drag */
    drag(e) {
      surface.map.updateMapLocation();
    },
    stop(e) {
      /*  update the last drag time */
      surface.timeOfLastDrag = new Date().getTime();
    },
  });

  /*  marker: add draggability */
  $('.marker').draggable();

  const valid = [87, 69, 82, 84, 89, 85, 73, 79, 80, 20,
    65, 83, 68, 70, 71, 72, 74, 75, 76,
    90, 88, 67, 86, 66, 78, 77,
    32];

    // Keydown
  $('*').on('keydown', (e) => {
    const chat_box = document.getElementById('chat-input-box');
    if (document.activeElement === chat_box) {
      return; // return if we're typing in the chat window
    }

    /*  prevent the default backspace function */
    if (e.which == 8) {
      e.preventDefault();
    }

    if (surface.intercepting) {
      surface.intercepting = false;
      const code = e.which;
      const modkey = (e.ctrlKey || e.altKey || e.metaKey);

      /*  prevent the default backspace function */
      if (e.which == 8) {
        surface.deleteTool();
      }

      if (e.shiftKey) {
        surface.shifting = true;
      }

      const validkey = $.inArray(code, valid) != -1;
      if (!modkey && validkey) {
        const keytype = 'ku';
        $(`#${keytype}_${code}`).trigger('click');
        $(`#${keytype}_${code}`).addClass('active');
      }
    }
  });

  // Keyup
  $('*').on('keyup', (e) => {
    /*  prevent the default backspace function */
    /* if(e.which == 8){
            e.preventDefault();
        } */

    if (!surface.intercepting) {
      surface.intercepting = true;
      const code = e.which;
      surface.shifting = false;
      const modkey = (e.ctrlKey || e.altKey || e.metaKey);
      const validkey = $.inArray(code, valid) != -1;


      if (!modkey && validkey) {
        const keytype = 'ku';
        $(`#${keytype}_${code}`).removeClass('active');
        return false;
      }
    }
  });

  /* handlers for adding markers */
  $('#fragment_container').on('click', (e) => {
    // Create the new marker
    ms.addTool(e);
    $('.delete-marker-btn').hide();

    $('.counter').html(`Click to Count: ${ms.countMarkers()}`);
    clicking = false;
    move_count = 0;
    let dragged = false;

    // Add handlers
    $('.marker').on('mousedown', (e) => { move_count = 0; clicking = true; dragged = true; ms.selectTool(e); });
    $('.marker').on('mouseup', (e) => { if (move_count > 5) dragged = true; });
    // $('.marker').on('mousedown', function(e){ms.deleteTool(e);});

    $('.marker').mousemove(() => {
      if (clicking === false) return;
      move_count++;
    });

    $('.marker, .character').click((e) => {
      if ($(e.target).hasClass('marker')) {
        var delete_button = $(e.target.childNodes[1]);
        if (delete_button.is(':visible')) {
          delete_button.hide();
        } else {
          $('.delete-marker-btn').hide();
          if (move_count == 0) {
            // delete_button.show();
          }
          dragged = false;
        }
      } else {
        // $("#"+$(e.target.parentNode).children()[1].id).show();
        var delete_button = $(`#${$(e.target.parentNode).children()[1].id}`);
        if (delete_button.is(':visible')) {
          delete_button.hide();
        } else {
          $('.delete-marker-btn').hide();
          if (move_count == 0) {
            // delete_button.show();
          }
          dragged = false;
        }
      }
      e.stopImmediatePropagation();
      if (move_count == 0 && that.mode === 'counting') {
        ms.deleteTool(e);
      }
    });

    $('.delete-marker-btn').click((e) => {
      e.stopImmediatePropagation();
      ms.deleteToolWithButton(e.target.parentNode);
    });
  });

  /* handler for updating tool letter values */
  $('.key').click((e) => {
    ms.setToolValue(e);
  });

  /* handler for updating tool examples */
  $('.key-letter').mouseover((e) => {
    ms.updateKeypadExample(e);
  });

  /* handler for pressing a number key & selecting a label */
  let lastLabel;
  $('.estimate-button').click((e) => {
    /* get the id of the label we're estimating */
    const id = `#${e.currentTarget.id.split('-')[0]}-count`;
    lastLabel = $(id).text();
    console.log(`LastLabel: ${lastLabel}`);

    /* make the div contenteditable */
    let $div = $(id),
      isEditable = $div.is('.editable');
    $div.prop('contenteditable', !isEditable).toggleClass('editable');

    /* remove what currently exists */
    $(id).text('');

    /* give the div focus */
    $(id).focus();
  });

  /* handler for whenever the task label loses focus ... */
  $('.task-option-count').focusout((e) => {
    /* get the id of the label the user is no longer estimating */
    const id = `#${e.currentTarget.id}`;

    /* make the div contenteditable */
    let $div = $(id),
      isEditable = $div.is('.editable');
    $div.prop('contenteditable', !isEditable).toggleClass('editable');

    /* did the user make any changes? */
    if ($(id).text().trim() == lastLabel.trim() || $(id).text().trim() == '') { // No
      console.log(`lastLabel: ${lastLabel}`);
      $(id).text(lastLabel);
    } else { // Yes
      /* remove all the markers for this label */
      const attr = $(id).attr('marker');
      console.log(`.marker-${attr}`);
      $(`.marker-${attr}`).remove();

      /* remove them from the surface */
      console.log(`label: ${e.currentTarget.id.split('-')[1].toLowerCase()}`);
      ms.deleteToolsByLabel(e.currentTarget.id.split('-')[1].toLowerCase());

      /* add the estimated attribute */
      $(id).attr('estimated', 'true');
    }
  });

  /* handler for restrict estamation input to only numbers */
  $('.task-option-count').keydown((e) => {
    // Allow: backspace, delete, tab, escape
    if ($.inArray(e.keyCode, [46, 8, 27, 110]) !== -1 ||
            // Allow: Ctrl+A, Command+A
            (e.keyCode == 65 && (e.ctrlKey === true || e.metaKey === true)) ||
            // Allow: home, end, left, right, down, up
            (e.keyCode >= 35 && e.keyCode <= 40)) {
      // let it happen, don't do anything
      return;
    }
    // Ensure that it is a number and stop the keypress
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
      e.preventDefault();
    }
  });

  /* handler for updating examples for counting */
  $('.task-option-toggle').click((e) => {
    e.stopImmediatePropagation();

    /* set the mode if necessary */
    if (ms.getMode() != 'counting') {
      ms.changeMode('counting', null);
    }

    /* is the element already selected? */
    if (!$(`#${e.currentTarget.id}`).hasClass('success')) {
      $(`#${e.currentTarget.id}`).siblings().removeClass('success');
      $(`#${e.currentTarget.id}`).addClass('success');
    }

    /* update with the relevant examples */
    $('.example-container').hide();
    $(`#example-container-${e.currentTarget.id.split('-')[0]}`).show();
  });

  /* zoom handlers */
  $('#zoom_in').click((event) => { if ($('#zoom').val() != '1.5') { ms.zoom_in(event); } });
  $('#zoom_out').click((event) => { if ($('#zoom').val() != '0.5') { ms.zoom_out(event); } });

  /* fullscreen handlers */
  $('#fullscreen').click((event) => { ms.toggleFullscreen(event); });

  /* mini map visibility handler */
  $('#toggle-mini-map').click((event) => { ms.map.toggleMapVisibility(event); });

  /* practice button */
  $('#practice-room-btn').click((e) => {
    that.togglePractice(e);
  });
};

/**
 * Renders all UI elements into the DOM.
 * TODO: Support configuration-based loading.
 */
ImageAnnotator.prototype.render = function (config) {
  // define templates for each component
  const stateVariables = '<input id="m_colour" type="hidden" value="20"/><input id="m_size" type="hidden" value="20"/><input id="zoom" type="hidden" value="1.00"/><input id="zoom_step" type="hidden" value="0.25"/>';
  const toggleControlTemplate = '<div id="zoom_view_toggles" class="side_buttons" style="float: left;margin-right: 10px;"><div id="controls"><div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div><div id="toggles"><div class="toggle-text">Zoom<hr/></div><div id="zoom_in"><div class="toggle-button waves-light btn"><span id="zoom-in-btn-icon" class="fa fa-search-plus"></span></div><div class="action"></div></div><div id="zoom_out"><div class="toggle-button waves-light btn"><span id="zoom-out-btn-icon" class="fa fa-search-minus"></span></div><div class="action"></div></div><div class="empty-space"></div><div class="toggle-text">View<hr/></div><div id="fullscreen"><div class="toggle-button waves-light btn"><span id="fullscreen-btn-icon" class="fa fa-arrows-alt"></span></div><div class="action"></div></div><div id="toggle-mini-map"><div class="toggle-button waves-light btn"><span id="toggle-mini-map-icon" class="fa fa-window-restore" style="left: 12px;"></span></div><div class="action"></div></div></div><div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div></div></div>';
  let annotationSurfaceTemplate = '<div id="main-interface"> <div class="view-divider" style="height: 7px;"></div> <div id="viewer"> <div id="fragment_container"> <div id="markers" class="s20 " style="position:absolute;"> <style>.marker {position: absolute;height: 20px;width: 20px;box-shadow: rgba(0,0,0,.496094) 0 2px 4px;-webkit-border-radius: 15px;border-radius: 15px;}.marker .character {font-size: 12px;line-height: 20px;font-weight: 600;}</style> </div> <div id="fragment"><img class="subject" src=""></div> </div> <div id="map" style="display: none; float: right;"> <div class="map_container"> <img id="thumb" /> <div class="location" style="border: 1px solid black;"></div> </div> </div> </div> <div class="view-divider"></div> <div id="bottom-controls"> <div id="bottom-control-keypad" style="float: left;display: inline-block;height: 100%;"> {LABEL_SPACE} </div> </div> <div class="view-divider"></div> </div>';
  const practiceWindowTemplate = '<div id="practice_toggles" class="practice side_buttons" style="float: left; width: 250px; min-height: 100px;"> <div id="controls"> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> <div id="practice_toggles_inner"> <div class="toggle-text"> Practice Room <a class="modal-trigger" href="#practice_information_modal" style="color: white;"><i class="fa fa-question-circle" aria-hidden="true"></i></a> <hr/> </div> <div class="practice-task-text"> <div>You have</div> <div class="practice-tasks-number-remaining"><div class="preloader-wrapper active"><div class="spinner-layer" style="border-color: orange"><div class="circle-clipper left"><div class="circle"></div></div><div class="gap-patch"><div class="circle"></div></div><div class="circle-clipper right"><div class="circle"></div></div></div></div></div> <div>available practice tasks.</div> <hr/> </div> <div> <button id="practice-room-btn" class="waves-light btn">Start Practicing</button> </div> </div> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> </div> </div>';
  const validatePracticeWindowTemplate = '<div id="practice_validation_toggles" class="submission side_buttons" style="display: none; float: left; width: 250px; min-height: 100px;"> <div id="controls"> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> <div id="practice_validation_toggles_inner"> <div class="toggle-text"> Check Your Answers <hr/> </div> <div id="validation-examples-container"><div><span id="validation-example-green">Green Circle</span> = Correct Tau</div><div><span id="validation-example-yellow">Yellow Circle</span> = Missed Tau</div><div><span id="validation-example-red">Red Circle</span> = Incorrect (Not Tau)</div></div> <button id="validate-practice-button" class="waves-light btn submit"> <i class="fa fa-check-circle-o" aria-hidden="true"></i> </button> </div> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> </div> </div>';
  const nextPracticeWindowTemplate = '<div id="practice_submission_toggles" class="submission side_buttons" style="display: none; float: left; width: 250px; min-height: 100px;"> <div id="controls"> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> <div id="practice_submission_toggles_inner"> <div class="toggle-text"> Next Practice Task <hr/> </div> <button id="next-practice-button" class="waves-light btn submit"> <i class="fa fa-arrow-right" aria-hidden="true"></i> </button> </div> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> </div> </div>';
  var keypad_template_greek = ' <div id="keypad" style="margin: 0 auto;"> <div id="fullscreen_button"></div> <div id="primary_keyboard" class="main"> <div id="variations"> <div class="example_label">Hover Over Characters<br/>Below for Examples</div> <div class="key_label"></div> <div class="details"> <div class="examples"> <div class="ex_1"></div> <div class="ex_2"></div> </div> </div> </div> <div id="keypad-letter-container" style="width: 535px;float:left;margin-bottom: 15px;"> <div class="upper_row standard" style="display: inline-block;width:100%;margin-left: 35px;"> <div class="info"> <h4 style="color: white;font-size: 18px;margin-top: 0;margin-bottom: 0;font-weight:600;">Greek Characters</h4> <p></p> </div> <div id="ku_32" class=" key waves-light btn key-letter"><span class="u">&#x0020;</span><span class="l">&nbsp;</span><span class="label"></span></div> <div id="ku_87" class=" key waves-light btn key-letter"><span class="u">&#x03A3;</span><span class="l"></span><span class="label">Sigma</span></div> <div id="ku_69" class=" key waves-light btn key-letter"><span class="u">&#x0395;</span><span class="l">&#x03B5;</span><span class="label">Epsilon</span></div> <div id="ku_82" class=" key waves-light btn key-letter"><span class="u">&#x03A1;</span><span class="l">&#x03C1;</span><span class="label">Rho</span></div> <div id="ku_84" class=" key waves-light btn key-letter"><span class="u">&#x03A4;</span><span class="l">&#x03C4;</span><span class="label">Tau</span></div> <div id="ku_89" class=" key waves-light btn key-letter"><span class="u">&#x03A5;</span><span class="l">&#x03C5;</span><span class="label">Upsilon</span></div> <div id="ku_85" class=" key waves-light btn key-letter"><span class="u">&#x0398;</span><span class="l">&#x03B8;</span><span class="label">Theta</span></div> <div id="ku_73" class=" key waves-light btn key-letter"><span class="u">&#x0399;</span><span class="l">&#x03B9;</span><span class="label">Iota</span></div> <div id="ku_79" class=" key waves-light btn key-letter"><span class="u">&#x039F;</span><span class="l">&#x03BF;</span><span class="label">Omicron</span></div> <div id="ku_80" class=" key waves-light btn key-letter"><span class="u">&#x03A0;</span><span class="l">&#x03C0;</span><span class="label">Pi</span></div> </div> <div class="middle_row standard" style="display: inline-block;width:100%;margin-left: 35px;"> <div id="ku_65" class=" key waves-light btn key-letter"><span class="u">&#x0391;</span><span class="l">&#x03B1;</span><span class="label">Alpha</span></div> <div id="ku_83" class=" key waves-light btn key-letter"><span class="u">&#x03F9;</span><span class="l">&#x03F2;</span><span class="label">Sigma</span></div> <div id="ku_68" class=" key waves-light btn key-letter"><span class="u">&#x0394;</span><span class="l">&#x03B4;</span><span class="label">Delta</span></div> <div id="ku_70" class=" key waves-light btn key-letter"><span class="u">&#x03A6;</span><span class="l">&#x03C6;</span><span class="label">Phi</span></div> <div id="ku_71" class=" key waves-light btn key-letter"><span class="u">&#x0393;</span><span class="l">&#x03B3;</span><span class="label">Gamma</span></div> <div id="ku_72" class=" key waves-light btn key-letter"><span class="u">&#x0397;</span><span class="l">&#x03B7;</span><span class="label">Eta</span></div> <div id="ku_74" class=" key waves-light btn key-letter"><span class="u">&#x039E;</span><span class="l">&#x03BE;</span><span class="label">Xi</span></div> <div id="ku_75" class=" key waves-light btn key-letter"><span class="u">&#x039A;</span><span class="l">&#x03BA;</span><span class="label">Kappa</span></div> <div id="ku_76" class=" key waves-light btn key-letter"><span class="u">&#x039B;</span><span class="l">&#x03BB;</span><span class="label">Lambda</span></div> </div> <div class="lower_row standard" style="display: inline-block;width:100%;margin-left: 65px;"> <div id="ku_90" class=" key waves-light btn key-letter"><span class="u">&#x0396;</span><span class="l">&#x03B6;</span><span class="label">Zeta</span></div> <div id="ku_88" class=" key waves-light btn key-letter"><span class="u">&#x03A7;</span><span class="l">&#x03C7;</span><span class="label">Khi</span></div> <div id="ku_67" class=" key waves-light btn key-letter"><span class="u">&#x03A8;</span><span class="l">&#x03C8;</span><span class="label">Psi</span></div> <div id="ku_86" class=" key waves-light btn key-letter"><span class="u">&#x03a9;</span><span class="l">&#x03C9;</span><span class="label">Omega</span></div> <div id="ku_66" class=" key waves-light btn key-letter"><span class="u">&#x0392;</span><span class="l">&#x03B2;</span><span class="label">Beta</span></div> <div id="ku_78" class=" key waves-light btn key-letter"><span class="u">&#x039D;</span><span class="l">&#x03BD;</span><span class="label">Nu</span></div> <div id="ku_77" class=" key waves-light btn key-letter"><span class="u">&#x039C;</span><span class="l">&#x03BC;</span><span class="label">Mu</span></div> </div> <div class="push"></div> </div> <div id="keypad-symbols-container" style="width: 200px;float:left;margin-left:27px;"> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class="info"> <h4 style="color: white;font-size: 18px;margin-top: 0;margin-bottom: 0;font-weight:600;">Greek Symbols</h4> <p></p> </div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE646;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE662;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE674;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE6A3;</span></div> </div> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE68F;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE66A;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#x0370;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE616;</span></div> </div> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE629;</span><</div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#x03DB;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE648;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE696;</span></div> </div> </div> </div> </div>';
  const nextWindowTemplate = '<div id="submission_toggles" class="submission side_buttons" style="float: left; width: 250px; min-height: 100px;"> <div id="controls"> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> <div id="submission_toggles_inner"> <div class="toggle-text"> Next Task <hr/> </div> <button id="next-button" class="waves-light btn submit"> <i class="fa fa-arrow-right" aria-hidden="true"></i> </button> </div> <div class="view-divider" style="border-top: 1px solid black; border-bottom: initial;height: 4px;width: 100%;"></div> </div> </div>';
  var keypad_template_greek = ' <div id="keypad" style="margin: 0 auto;"> <div id="fullscreen_button"></div> <div id="primary_keyboard" class="main"> <div id="variations"> <div class="example_label">Hover Over Characters<br/>Below for Examples</div> <div class="key_label"></div> <div class="details"> <div class="examples"> <div class="ex_1"></div> <div class="ex_2"></div> </div> </div> </div> <div id="keypad-letter-container" style="width: 535px;float:left;margin-bottom: 15px;"> <div class="upper_row standard" style="display: inline-block;width:100%;margin-left: 35px;"> <div class="info"> <h4 style="color: white;font-size: 18px;margin-top: 0;margin-bottom: 0;font-weight:600;">Greek Characters</h4> <p></p> </div> <div id="ku_32" class=" key waves-light btn key-letter"><span class="u">&#x0020;</span><span class="l">&nbsp;</span><span class="label"></span></div> <div id="ku_87" class=" key waves-light btn key-letter"><span class="u">&#x03A3;</span><span class="l"></span><span class="label">Sigma</span></div> <div id="ku_69" class=" key waves-light btn key-letter"><span class="u">&#x0395;</span><span class="l">&#x03B5;</span><span class="label">Epsilon</span></div> <div id="ku_82" class=" key waves-light btn key-letter"><span class="u">&#x03A1;</span><span class="l">&#x03C1;</span><span class="label">Rho</span></div> <div id="ku_84" class=" key waves-light btn key-letter"><span class="u">&#x03A4;</span><span class="l">&#x03C4;</span><span class="label">Tau</span></div> <div id="ku_89" class=" key waves-light btn key-letter"><span class="u">&#x03A5;</span><span class="l">&#x03C5;</span><span class="label">Upsilon</span></div> <div id="ku_85" class=" key waves-light btn key-letter"><span class="u">&#x0398;</span><span class="l">&#x03B8;</span><span class="label">Theta</span></div> <div id="ku_73" class=" key waves-light btn key-letter"><span class="u">&#x0399;</span><span class="l">&#x03B9;</span><span class="label">Iota</span></div> <div id="ku_79" class=" key waves-light btn key-letter"><span class="u">&#x039F;</span><span class="l">&#x03BF;</span><span class="label">Omicron</span></div> <div id="ku_80" class=" key waves-light btn key-letter"><span class="u">&#x03A0;</span><span class="l">&#x03C0;</span><span class="label">Pi</span></div> </div> <div class="middle_row standard" style="display: inline-block;width:100%;margin-left: 35px;"> <div id="ku_65" class=" key waves-light btn key-letter"><span class="u">&#x0391;</span><span class="l">&#x03B1;</span><span class="label">Alpha</span></div> <div id="ku_83" class=" key waves-light btn key-letter"><span class="u">&#x03F9;</span><span class="l">&#x03F2;</span><span class="label">Sigma</span></div> <div id="ku_68" class=" key waves-light btn key-letter"><span class="u">&#x0394;</span><span class="l">&#x03B4;</span><span class="label">Delta</span></div> <div id="ku_70" class=" key waves-light btn key-letter"><span class="u">&#x03A6;</span><span class="l">&#x03C6;</span><span class="label">Phi</span></div> <div id="ku_71" class=" key waves-light btn key-letter"><span class="u">&#x0393;</span><span class="l">&#x03B3;</span><span class="label">Gamma</span></div> <div id="ku_72" class=" key waves-light btn key-letter"><span class="u">&#x0397;</span><span class="l">&#x03B7;</span><span class="label">Eta</span></div> <div id="ku_74" class=" key waves-light btn key-letter"><span class="u">&#x039E;</span><span class="l">&#x03BE;</span><span class="label">Xi</span></div> <div id="ku_75" class=" key waves-light btn key-letter"><span class="u">&#x039A;</span><span class="l">&#x03BA;</span><span class="label">Kappa</span></div> <div id="ku_76" class=" key waves-light btn key-letter"><span class="u">&#x039B;</span><span class="l">&#x03BB;</span><span class="label">Lambda</span></div> </div> <div class="lower_row standard" style="display: inline-block;width:100%;margin-left: 65px;"> <div id="ku_90" class=" key waves-light btn key-letter"><span class="u">&#x0396;</span><span class="l">&#x03B6;</span><span class="label">Zeta</span></div> <div id="ku_88" class=" key waves-light btn key-letter"><span class="u">&#x03A7;</span><span class="l">&#x03C7;</span><span class="label">Khi</span></div> <div id="ku_67" class=" key waves-light btn key-letter"><span class="u">&#x03A8;</span><span class="l">&#x03C8;</span><span class="label">Psi</span></div> <div id="ku_86" class=" key waves-light btn key-letter"><span class="u">&#x03a9;</span><span class="l">&#x03C9;</span><span class="label">Omega</span></div> <div id="ku_66" class=" key waves-light btn key-letter"><span class="u">&#x0392;</span><span class="l">&#x03B2;</span><span class="label">Beta</span></div> <div id="ku_78" class=" key waves-light btn key-letter"><span class="u">&#x039D;</span><span class="l">&#x03BD;</span><span class="label">Nu</span></div> <div id="ku_77" class=" key waves-light btn key-letter"><span class="u">&#x039C;</span><span class="l">&#x03BC;</span><span class="label">Mu</span></div> </div> <div class="push"></div> </div> <div id="keypad-symbols-container" style="width: 200px;float:left;margin-left:27px;"> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class="info"> <h4 style="color: white;font-size: 18px;margin-top: 0;margin-bottom: 0;font-weight:600;">Greek Symbols</h4> <p></p> </div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE646;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE662;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE674;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE6A3;</span></div> </div> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE68F;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE66A;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#x0370;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE616;</span></div> </div> <div class="standard symbol-container" style="display: inline-block;width:100%;"> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE629;</span><</div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#x03DB;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE648;</span></div> <div class=" key waves-light btn" style="font-family: Grec-Subset;font-size: 1.7em;padding-top: 3px;padding-left: 1px;"><span class="u">&#xE696;</span></div> </div> </div> </div> </div>';
  let counting_template = '<div id="countingpad" style="margin: 0 auto;"><div id="primary_countingboard" class="main"><div class="row"><div class="col s4 push-s8">{LABEL_SPACE}</div><div id="examples-container-default" class="center example-container col s8 pull-s4">Click one of the labels to the right to begin counting an object and see related examples.</div>{EXAMPLES_SPACE}</div></div> </div>';

  let modalsTemplate = '<div id="loading_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#loading_modal" style="height: 110px;"><h5>Loading Task Interface</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="experiment_complete_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#experiment_complete_modal" style="height: 110px;"><center><h5>Leaving Task</h5></center><div class="progress"><div class="indeterminate"></div></div></div></div><div id="fetching_task_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#fetching_task_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Getting Next Task</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div><img src=\"https://media.giphy.com/media/j5QcmXoFWl4Q0/giphy.gif\"/></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'>You\'ve seen all of the images for this task. <p>Redirecting you to the homepage ... </p></div></div></div><div id="practice_finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#practice_finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div>You\'ve completed all available practice tasks.</div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p>Exiting the Practice Room</p></div></div></div><div id="practice_information_modal" class="modal" style="top: auto; width: 510px;height: 565px;"><div class="modal-content" href="#practice_information_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">What is the Practice Room?</h5><hr/><div class="practice-information-body">The Practice Room is a task mode that lets you practice tasks without being penalized. The mode facilitates three objectives: <center><img src="https://www.burkert.com/var/buerkert/storage/images/media/images/speech-bubbles/3211190-1-eng-INT/speech-bubbles.jpg" style="width: 300px;"></center><ul><li><b>Practice tasks tell you what you did correctly.</b> You can try the task and compare your answers to what\'s correct.</li><hr style="width: 100px;"/><li><b>Practice tasks don\'t count against you:</b> However, practice tasks don\'t count toward the tasks required to complete the HIT.</li><hr style="width: 100px;"/><li><b>You can practice at your own leisure:</b> You can switch to the Practice Room at any point during the task. If you switch modes in the middle of a task, your annotations won\'t be erased.</li></ul></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="practice-information-button" class="modal-action modal-close btn">Got it!</a></p></div></div></div><div id="survey_efficacy_modal" class="modal" style="top: auto; width: 710px;height: 365px;"><div class="modal-content" href="#survey_efficacy_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Rate Yourself!</h5><hr/><div class="self-efficacy-survey-body"><center><p style="width: 500px;">On a scale of 1 to 10, how confident are you that you can perfectly identify all Greek Taus in the next image?</p></center><input id="self-efficacy-slider" type="range" min="1" max="10" step="1" value="5"/><center><p style="font-size: 0.7em; margin: 0;">Note: Your answer will not affect your payment.</p></center></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="efficacy-submit-button" class="modal-action modal-close btn">Submit</a></p></div></div></div><div id="tutorial_modal" class="modal" style="top: auto; min-height: 560px;height: 560px;"><div class="modal-content modal-trigger" href="#tutorial_modal" style="height: 100%;padding: 12px;"><div id="carousel-container" class="carousel carousel-slider center " style="height:100% !important;"><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Task Instructions</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/1-start.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">In this task, you will identify <strong>ONLY</strong> Greek Taus in ancient manuscripts written on papyrus. Greek Taus look near identical to the English letter T. Click the <i>"Next"</i> button to learn how the interface works.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Creating Annotations</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/4-annotation.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can create an annotation by clicking on the image, and you can assign an annotation a letter with the on-screen keyboard. Annotations can be deleted with the Backspace key.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Using the Mini-Map</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/3-mini-map.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">The Mini-Map controls the field-of-view of the annotation surface. You can adjust your perspective by dragging the window in the mini-map.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Zooming and Fullscreen</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/2-zoom-fullscreen.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can also zoom in and out of the annotation surface with the zooming buttons. In addition, you can also toggle Fullscreen Mode with the fullscreen button to annotate with your entire browser window.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Completing a Task</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/7-next-task.png" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">When you\'re ready to go to the next task, click the \'Next Task\" button, and you will be given the next image for annotation.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-close">I\'m Ready to Begin!</button></div></div></div></div>';


  if ('collaboration' in config) {
    if ('active' in config.collaboration) {
      if (config.collaboration.active) {
        // 1. active
        if (config.collaboration.style === 'active') {
          modalsTemplate = '<div id="loading_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#loading_modal" style="height: 110px;"><h5>Loading Task Interface</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="experiment_complete_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#experiment_complete_modal" style="height: 110px;"><center><h5>Leaving Task</h5></center><div class="progress"><div class="indeterminate"></div></div></div></div><div id="fetching_task_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#fetching_task_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Getting Next Task</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div><img src=\"https://media.giphy.com/media/j5QcmXoFWl4Q0/giphy.gif\"/></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'>You\'ve seen all of the images for this task. <p>Redirecting you to the homepage ... </p></div></div></div><div id="practice_finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#practice_finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div>You\'ve completed all available practice tasks.</div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p>Exiting the Practice Room</p></div></div></div><div id="practice_information_modal" class="modal" style="top: auto; width: 510px;height: 565px;"><div class="modal-content" href="#practice_information_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">What is the Practice Room?</h5><hr/><div class="practice-information-body">The Practice Room is a task mode that lets you practice tasks without being penalized. The mode facilitates three objectives: <center><img src="https://www.burkert.com/var/buerkert/storage/images/media/images/speech-bubbles/3211190-1-eng-INT/speech-bubbles.jpg" style="width: 300px;"></center><ul><li><b>Practice tasks tell you what you did correctly.</b> You can try the task and compare your answers to what\'s correct.</li><hr style="width: 100px;"/><li><b>Practice tasks don\'t count against you:</b> However, practice tasks don\'t count toward the tasks required to complete the HIT.</li><hr style="width: 100px;"/><li><b>You can practice at your own leisure:</b> You can switch to the Practice Room at any point during the task. If you switch modes in the middle of a task, your annotations won\'t be erased.</li></ul></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="practice-information-button" class="modal-action modal-close btn">Got it!</a></p></div></div></div><div id="survey_efficacy_modal" class="modal" style="top: auto; width: 710px;height: 365px;"><div class="modal-content" href="#survey_efficacy_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Rate Yourself!</h5><hr/><div class="self-efficacy-survey-body"><center><p style="width: 500px;">On a scale of 1 to 10, how confident are you that you can perfectly identify all the Greek Taus in the next image?</p></center><input id="self-efficacy-slider" type="range" min="1" max="10" step="1" value="5"/><center><p style="font-size: 0.7em; margin: 0;">Note: Your answer will not affect your payment.</p></center></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="efficacy-submit-button" class="modal-action modal-close btn">Submit</a></p></div></div></div><div id="tutorial_modal" class="modal" style="top: auto; min-height: 560px;height: 560px;"><div class="modal-content modal-trigger" href="#tutorial_modal" style="height: 100%;padding: 12px;"><div id="carousel-container" class="carousel carousel-slider center " style="height:100% !important;"><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Task Instructions</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/1-start.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">In this task, you will identify <strong>ONLY</strong> Greek Taus in ancient manuscripts written on papyrus. Greek Taus look near identical to the English letter T. Click the <i>"Next"</i> button to learn how the interface works.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Creating Annotations</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/4-annotation.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can create an annotation by clicking on the image, and you can assign an annotation a letter with the on-screen keyboard. Annotations can be deleted with the Backspace key.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Using the Mini-Map</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/3-mini-map.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">The Mini-Map controls the field-of-view of the annotation surface. You can adjust your perspective by dragging the window in the mini-map.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Zooming and Fullscreen</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/2-zoom-fullscreen.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can also zoom in and out of the annotation surface with the zooming buttons. In addition, you can also toggle Fullscreen Mode with the fullscreen button to annotate with your entire browser window.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Collaborate with Tate</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/5-tate-intro.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">In this task, you will be accompanied by <strong><i>Tate</i></strong>, a bot designed to annotate with you as a team. As you begin each task, you should engage <strong><i>Tate</i></strong> for help when you need it. </div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Annotating with Tate</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/6-tate-annotation.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">After you engage <strong><i>Tate</i></strong> in conversation, the bot will try to work with you by annotating the image. Tate will annotate <strong><i>in parallel</i></strong> with you, and will <strong><i>only</i></strong> annotate when you tell him to.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Completing a Task</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/7-next-task.png" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">When you\'re ready to go to the next task, click the \'Next Task\" button, and you will be given the next image for annotation.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-close">I\'m Ready to Begin!</button></div></div></div></div>';
        } else { // 2. passive
          modalsTemplate = '<div id="loading_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#loading_modal" style="height: 110px;"><h5>Loading Task Interface</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="experiment_complete_modal" class="modal" style="top: auto; width: 310px !important;"><div class="modal-content modal-trigger" href="#experiment_complete_modal" style="height: 110px;"><center><h5>Leaving Task</h5></center><div class="progress"><div class="indeterminate"></div></div></div></div><div id="fetching_task_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#fetching_task_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Getting Next Task</h5><div class="progress"><div class="indeterminate"></div></div></div></div><div id="finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div><img src=\"https://media.giphy.com/media/j5QcmXoFWl4Q0/giphy.gif\"/></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'>You\'ve seen all of the images for this task. <p>Redirecting you to the homepage ... </p></div></div></div><div id="practice_finished_modal" class="modal" style="top: auto; width: 310px;"><div class="modal-content modal-trigger" href="#practice_finished_modal" style="height: 110px;text-align: center;"><h4 id="fetching-task-modal-text">You\'re Done!</h4><hr/><div>You\'ve completed all available practice tasks.</div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p>Exiting the Practice Room</p></div></div></div><div id="practice_information_modal" class="modal" style="top: auto; width: 510px;height: 565px;"><div class="modal-content" href="#practice_information_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">What is the Practice Room?</h5><hr/><div class="practice-information-body">The Practice Room is a task mode that lets you practice tasks without being penalized. The mode facilitates three objectives: <center><img src="https://www.burkert.com/var/buerkert/storage/images/media/images/speech-bubbles/3211190-1-eng-INT/speech-bubbles.jpg" style="width: 300px;"></center><ul><li><b>Practice tasks tell you what you did correctly.</b> You can try the task and compare your answers to what\'s correct.</li><hr style="width: 100px;"/><li><b>Practice tasks don\'t count against you:</b> However, practice tasks don\'t count toward the tasks required to complete the HIT.</li><hr style="width: 100px;"/><li><b>You can practice at your own leisure:</b> You can switch to the Practice Room at any point during the task. If you switch modes in the middle of a task, your annotations won\'t be erased.</li></ul></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="practice-information-button" class="modal-action modal-close btn">Got it!</a></p></div></div></div><div id="survey_efficacy_modal" class="modal" style="top: auto; width: 710px;height: 365px;"><div class="modal-content" href="#survey_efficacy_modal" style="height: 110px;text-align: center;"><h5 id="fetching-task-modal-text">Rate Yourself!</h5><hr/><div class="self-efficacy-survey-body"><center><p style="width: 500px;">On a scale of 1 to 10, how confident are you that you can perfectly identify all the Greek Taus in the next image?</p></center><input id="self-efficacy-slider" type="range" min="1" max="10" step="1" value="5"/><center><p style="font-size: 0.7em; margin: 0;">Note: Your answer will not affect your payment.</p></center></div><hr/><div class=\'row\' style=\'margin-bottom: 0px;\'><p><a id="efficacy-submit-button" class="modal-action modal-close btn">Submit</a></p></div></div></div><div id="tutorial_modal" class="modal" style="top: auto; min-height: 560px;height: 560px;"><div class="modal-content modal-trigger" href="#tutorial_modal" style="height: 100%;padding: 12px;"><div id="carousel-container" class="carousel carousel-slider center " style="height:100% !important;"><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Task Instructions</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/1-start.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">In this task, you will identify <strong>ONLY</strong> Greek Taus in ancient manuscripts written on papyrus. Greek Taus look near identical to the English letter T. Click the <i>"Next"</i> button to learn how the interface works.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Creating Annotations</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/4-annotation.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can create an annotation by clicking on the image, and you can assign an annotation a letter with the on-screen keyboard. Annotations can be deleted with the Backspace key.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Using the Mini-Map</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/3-mini-map.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">The Mini-Map controls the field-of-view of the annotation surface. You can adjust your perspective by dragging the window in the mini-map.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Zooming and Fullscreen</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/2-zoom-fullscreen.gif" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">You can also zoom in and out of the annotation surface with the zooming buttons. In addition, you can also toggle Fullscreen Mode with the fullscreen button to annotate with your entire browser window.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Collaborate with Tate</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/8-tate-intro-passive.png" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">In this task, you will be accompanied by <strong><i>Tate</i></strong>, a bot designed to annotate with you as a team. As you begin each task, you should engage <strong><i>Tate</i></strong> for help when you need it. </div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Talking with Tate</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/9-tate-feedback.png" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">After you engage <strong><i>Tate</i></strong> in conversation, the bot will try to monitor your performance. Tate will specifically give you feedback when you go to the next task.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-next">Next</button></div><div class="carousel-item blue-grey lighten-3 black-text" href="#one!"><div style="margin-top: 15px;"><h2 style="font-size: 32px;font-weight:600;">Completing a Task</h2></div><hr class="tutorial-hr"/><p class="white-text"><img class="tutorial-img" src="https://curio-media.s3.amazonaws.com/oxyrhynchus-papyri/tutorial/7-next-task.png" style="border: 1px solid black;"></p><div class="black-text" style="width: 70%;margin:0 auto;">When you\'re ready to go to the next task, click the \'Next Task\" button, and you will be given the next image for annotation.</div><hr class="tutorial-hr"/><button class="waves-light btn tutorial-btn-prev">Back</button><button class="waves-light btn tutorial-btn-close">I\'m Ready to Begin!</button></div></div></div></div>';
        }
      }
    }
  }

  // before we start appending, check the mode to insert the right label space replacement.
  if (config.mode.toLowerCase() == 'transcription') {
    if ('language' in config) {
      if (config.language.toLowerCase() == 'greek') {
        annotationSurfaceTemplate = annotationSurfaceTemplate.replace('{LABEL_SPACE}', keypad_template_greek);
      } else {
        annotationSurfaceTemplate = annotationSurfaceTelate.replace('{LABEL_SPACE}', 'ERROR: Unsupported language.');
      }
    } else {
      annotationSurfaceTemplate = annotationSurfaceTemplate.replace('{LABEL_SPACE}', 'ERROR: No language specified.');
    }
  } else if (config.mode == 'counting') {
    let estimate_display = 'none';
    if ('estimate' in config) {
      if (config.estimate === true) {
        estimate_display = 'block';
      }
    }

    // build the counting UI based on the config
    // 1. build the label container
    let labels = '<div id="task-options-header" class="center white-text">Classify the following:</div><hr/><div class="joint-toggle">';
    for (var i = 0; i < config.labels.length; i++) {
      labels += `<label id="${config.labels[i].name.toLowerCase()}-btn" class="task-option-toggle toggle-btn" lval="marker-n${i + 1}"><input type="radio" name="${i + 1}" value="${config.labels[i].name}"/>${config.labels[i].name}<div id="${config.labels[i].name.toLowerCase()}-count" class="task-option-count" marker="n${i + 1}" >?</div></label><i id="${config.labels[i].name.toLowerCase()}-estimate" class="white-text estimate-button fa fa-pencil-square-o fa-1" style="display: ${estimate_display};color:black;float: right;padding-top: 12px;cursor: pointer;"></i>`;
    }
    labels += '</div>';
    counting_template = counting_template.replace('{LABEL_SPACE}', labels);

    // 1. build the examples container for each label
    let examples = '';
    for (var i = 0; i < config.labels.length; i++) {
      let example = `<div id="example-container-${config.labels[i].name.toLowerCase()}" class="example-container col s8 pull-s4" style="display: none;">`;
      for (let j = 0; j < config.labels[i].examples.length; j++) {
        example += `<div class="example-img"><img src="${config.labels[i].examples[j]}"/></div>`;
      }
      example += '</div>';
      examples += example;
    }
    counting_template = counting_template.replace('{EXAMPLES_SPACE}', examples);

    annotationSurfaceTemplate = annotationSurfaceTemplate.replace('{LABEL_SPACE}', counting_template);
  } else {
    annotationSurfaceTemplate = annotationSurfaceTemplate.replace('{LABEL_SPACE}', 'ERROR: Unsupported mode.');
  }

  const parent_container = $('#task-container');
  parent_container.append(stateVariables);
  parent_container.append(toggleControlTemplate);
  parent_container.append(annotationSurfaceTemplate);


  // check for practice
  if ('practice' in config) {
    if (config.practice.active) {
      // append the practice window
      parent_container.append(practiceWindowTemplate);
    }
  }

  // check if the next button needs to be shown
  if ('next_button' in config) {
    if (config.next_button.toLowerCase() !== 'hidden') {
      parent_container.append(nextWindowTemplate);
    }
  }
  parent_container.append(validatePracticeWindowTemplate);
  parent_container.append(nextPracticeWindowTemplate);
  parent_container.append(modalsTemplate);

  // attach materialize modal loaders
  const modals = ['loading_modal', 'fetching_task_modal', 'finished_modal', 'practice_finished_modal', 'practice_information_modal', 'survey_efficacy_modal', 'experiment_complete_modal', 'tutorial_modal'];
  for (var i = 0; i < modals.length; i++) {
    this.modals[modals[i]] = $(`#${modals[i]}`);
    this.modals[modals[i]].modal({ dismissible: false });
  }

  // active the carousel
  $('.carousel.carousel-slider').carousel({
    fullWidth: true,
    indicators: false,
  });
  $('#carousel-container').css('height', '100%');

  // move next carousel
  $('.tutorial-btn-next').click((e) => {
    e.preventDefault();
    e.stopPropagation();
    $('.carousel').carousel('next');
  });

  // move prev carousel
  $('.tutorial-btn-prev').click((e) => {
    e.preventDefault();
    e.stopPropagation();
    $('.carousel').carousel('prev');
  });

  $('.tutorial-btn-close').click((e) => {
    e.preventDefault();
    e.stopPropagation();
    that.modals.tutorial_modal.modal('close');
    window.localStorage.setItem('crowdcurio-tau-seen-tutorial', 'True');
    setTimeout(() => { // open the survey modal
      that.modals.survey_efficacy_modal.modal('open');
    }, 500);
  });

  // configuration for estimation in counting
  if (config.mode == 'counting') {
    if ('estimate' in config) {
      if (config.estimate === false) {
        $('.estimate-button').hide();
      }
    }
  }

  // init the jquery slider
  $('#self-efficacy-slider').rangeslider({
    onInit() {

    },
  }).each(() => {
    //
    // Add labels to slider whose values
    // are specified by min, max and whose
    // step is set to 1
    //

    // Get the options for this slider

    // Space out values
    const vals = 9;
    $("<div id='efficacy-label-container'></div>").insertAfter('#self-efficacy-slider');
    for (let i = 0; i <= vals; i++) {
      const el = $(`<label class="efficacy-label">${i + 1}</label>`).css('left', `${i / vals * 100}%`);

      $('#efficacy-label-container').append(el);
    }
    $('<br/>').insertAfter('#self-efficacy-slider');
    $('span.thumb').remove();
  });

  var that = this;
  $('#efficacy-submit-button').click(() => {
    // read the value of the slider
    const efficacy = $('#self-efficacy-slider').val();

    // save a new event model
    that.client.create('event', {
      content: {
        type: 'efficacy-survey',
        efficacy,
      },
    }, () => {
      print('Efficacy Survey: Saved!');

      // reset the slider
      $('#self-efficacy-slider').val(5);
    });
  });

  // open the loading modal
  this.modals.loading_modal.modal('open');
};

ImageAnnotator.prototype.loadTutorial = function (config) {
  $('head').append($('<link rel="stylesheet" type="text/css" />').attr('href', 'https://curio-media.s3.amazonaws.com/css/introjs.css'));

  // put steps together algorithmically
  const steps = [
    {
      element: '#main-interface',
      intro: '<b>Welcome!</b><p>Before you start counting, let us help you familiarize yourself with the interface.</p><p>Click "Next" to begin.</p>',
    },
    {
      element: '#bottom-control-keypad',
      intro: 'The <b><i>Counting Window</i></b> lets you select a particular label (i.e. Tau).',
    },
    {
      element: '#tau-btn',
      intro: 'Click here to begin counting Taus.',
    },
    {
      element: '#primary_countingboard',
      intro: "After clicking on a label, you'll see a few examples of what you're trying to count.",
    },
    {
      element: '#viewer',
      intro: 'To count a letter, click on the image to make an annotation. Each click will increase the count for the object. Try it!',
    },
    {
      element: '#viewer',
      intro: 'Annotations can be <b>moved</b> by clicking and dragging the annotation. Annotations can be <b>deleted</b> by clicking on the annotation twice and clicking the "Delete" button that appears.',
    },
    {
      element: '#map',
      intro: 'The <b><i>Map</i></b> shows the entire image. The shaded region shows what portion of the image is visible. You can <b>drag</b> the shaded region to change your view of the image. <p>Try moving the shaded region around!</p>',
    },
    {
      element: '#toggles',
      intro: 'The <b>View</b> toggle allows you to <b>fullscreen</b> the interface and hide the minimap.',
    },
  ];


  if ('practice' in config) {
    if (config.practice.active) {
      // append the practice window
      steps.push({
        element: '#practice_toggles',
        intro: 'The Practice Room lets you try tasks and get feedback on what was correct or incorrect. You can start practicing at any point during the task.',
      });
    }
  }

  steps.push({
    element: '#submission_toggles',
    intro: "After you've counted the objects, you can click the Arrow button, which will give you the next image.<p><b>Click \"Done\"</i> to begin counting this image!</b></p>",
  });

  // check if the
  const intro = IntroJS.introJs();
  intro.setOptions({
    exitOnOverlayClick: false,
    steps,
  });

  // add a handler for completing the tutorial
  const that = this;
  intro.oncomplete(() => {
    window.localStorage.setItem('crowdcurio-tau-seen-tutorial', 'True');
    setTimeout(() => { that.modals.survey_efficacy_modal.modal('open'); }, 500);
  });

  // start the tutorial
  // intro.start();
};

/**
 * Changes the mode of the image annotator. Controls the functionality of event triggers.
 * @param {string} mode : the name of the mode to change to.
 * @param {*} event : an event
 */
ImageAnnotator.prototype.changeMode = function (mode, event) {
  $('#issuepad').hide();
  if (mode == 'transcription') {
    /*    update the object's mode */
    ms.mode = 'transcription';

    /*    update the DOM elements */
    $('#measure_mode').removeClass();
    $('#transcribe_mode').addClass('current');

    /*  hide the measure instructions */
    $('#measurepad').fadeOut(100, () => { $('#keypad').fadeIn(); });

    /*    toggle the visible buttons */
    $('#toggle_next').fadeIn();
    $('#toggle_solid').fadeIn();
    $('#delete').fadeIn();
    $('.colour_show').animate({ height: 36, opacity: 100 }, 'slow');

    /* show markers */
    if (!$('#toggle_solid').hasClass('on')) {
      $('.marker').removeClass('solid');
      $('.character', '.marker').hide();
      // $(event.target).removeClass("on");
      $('#mode_tip').html('Show');
      $('.marker').css('opacity', $('#m_opacity').val());
    } else {
      $('.marker').each(function (i, m) {
        console.log($(this).hasClass('solid'));
        if ($(this).hasClass('solid')) {
          $('.marker').fadeTo('slow', 1);
        } else {
          $('.marker').fadeTo('slow', 0.3);
        }
      });
    }

    $('#measurements').hide();
    $('.measurement').hide();
  } else if (mode == 'measure') { /*  mode == "measure" */
    /*    update the object's mode */
    ms.mode = 'measure';

    /*    update the DOM elements */
    $('#transcribe_mode').removeClass();
    $('#measure_mode').addClass('current');

    /*    hide the keypad, show the measurepad */
    $('#keypad').fadeOut(100, () => { $('#measurepad').fadeIn(); });

    /*    hide the colour menu if it was visible */
    surface.toggleColourMenu(event, true);

    /*    toggle the visible buttons */
    $('#toggle_next').fadeOut();
    $('#toggle_solid').fadeOut();
    $('#delete').fadeOut();
    $('.colour_show').animate({ height: 0, opacity: 0 }, 'slow');

    /* hide markers */
    $('.marker').fadeTo('slow', 0);

    $('#measurements').show();
    $('.measurement').show();

    surface.canvas = document.getElementById('measurements');
    surface.ctx = this.canvas.getContext('2d');
  } else {
    /* otherwise, set the mode to the passed parameter */
    ms.mode = mode;
  }
};

/**
 * Returns the current mode of the annotator.
 */
ImageAnnotator.prototype.getMode = function () {
  return ms.mode;
};

/**
 * Resets the surface to a clean slate. Removes markers, resets the location of all image containers.
 */
ImageAnnotator.prototype.resetSurface = function () {
  /* adjust map */
  $('#fragment_container').css('left', '0');
  $('#fragment_container').css('top', '0');
  $('#map .location').css('left', '0');
  $('#map .location').css('top', '0');

  /* exterminate the stored and rendered markers */
  $('.marker').remove();
  $('.map-marker').remove();
  surface.markers = {};

  /* reset the label counters */
  // $('.task-option-toggle.success').removeClass('success');
  $('.task-option-count').text('?');

  /* reset the examples */
  $('.detection-wrapright').html('<div id="detection_output_interface"></div>');

  /* set the surface mode to something arbitrary */
  $('#zoom').val('1.00');
  surface.mode = 'issues';
  surface.selection = null;
};

ImageAnnotator.prototype.toggleColourMenu = function (event, forceHide) {
  if ($('.colours').css('display') == 'block' || forceHide) {
    $('.colours').fadeOut(() => { $('#map').fadeIn(); });
    $;
  } else {
    $('.modal').hide();
    $('#map').fadeOut(() => { $('.colours').fadeIn(); });
  }
  //this.update_toggles();
  event.preventDefault();
};

ImageAnnotator.prototype.toggleKeypadExtras = function (event) {
  if ($(event.target).hasClass('symbols_show')) {
    $('.diacritics').fadeOut('fast');
    $('.symbols').fadeIn('fast');
  }

  if ($(event.target).hasClass('diacritics_show')) {
    $('.symbols').fadeOut('fast');
    $('.diacritics').fadeIn('fast');
  }
  $('#pad_toggles div').removeClass('current');
  $(event.target).addClass('current');
  event.preventDefault();
};

ImageAnnotator.prototype.toggleKeypadAssist = function (event) {
  if ($('#variations').css('display') == 'none') {
    $('#variations .examples').hide();
    $('#variations').slideDown();
    $(event.target).addClass('on');
    $('#variations h2').show();
    $('#variations .key_label').html('');
  } else {
    $('#variations .examples').fadeOut(200, () => {
      $('#variations').slideUp();
    });
    $(event.target).removeClass('on');
  }

  event.preventDefault();
};

ImageAnnotator.prototype.changeToolProperties = function (event, option) {
  if (option == 'colour') {
    $('.colours ul li').removeClass('current');

    $(event.target).addClass('current');

    const hex = $(event.target).css('background-color');

    $('.marker').css('background-color', hex);
    $('#m_colour').val(hex);
    $('#colour').css('background-color', hex);

    if ($(event.target).hasClass('negative')) {
      $('#markers').addClass('negative');
    } else {
      $('#markers').removeClass('negative');
    }

    if ($(event.target).hasClass('alternative')) {
      $('#markers').addClass('alternative');
    } else {
      $('#markers').removeClass('alternative');
    }
    event.preventDefault();
  } else if (option == 'size') {
    $('.sizes div').removeClass('current');
    $(event.target).addClass('current');

    const old_size = parseInt($('#m_size').val(), 10);
    let new_size = parseInt($(event.target).attr('id').split('_')[1], 10);


    $('#m_size').val(new_size);
    $('#markers').removeClass(`s${old_size}`);
    $('#markers').addClass(`s${new_size}`);

    // Account for Zoom level
    const zoom = $('#zoom').val();
    new_size = zoom * new_size;

    // Ensure sizes are always even (to stop drifting when zooming in and out)
    new_size = Math.round(new_size);
    if (new_size % 2 != 0) { new_size++; }

    // Resize and shift
    if ($('.marker').length > 0) {
      const existing_size = $('.marker').css('height').replace(/px/ig, '');
      $('.marker').css('height', `${new_size}px`);
      $('.marker').css('width', `${new_size}px`);
      const shift = (existing_size - new_size) / 2;
      $('.marker').animate({ left: `+=${shift}`, top: `+=${shift}` }, 0);
      surface.resizeFont(zoom);
    }
  } else if (option == 'opacity') {
    $('.opacity div').removeClass('current');
    $(event.target).addClass('current');
    const opacity = parseFloat($(event.target).attr('id').split('_')[1]);

    /*  update the opacity */
    $('#m_opacity').val(opacity);
    $('.marker').not('.solid').css('opacity', opacity);
  }

  /*  prevent the default event */
  event.preventDefault();
};

ImageAnnotator.prototype.resizeFont = function (factor) {
  const marker_scale = $('#m_size').val() / $('#m_default_size').val();
  const scaled = marker_scale * $('#font_size').val();
  const fontsize = (scaled * factor);
  $('.character').css('font-size', `${fontsize}px`);
  $('.character').css('line-height', `${Math.round($('#m_size').val() * factor)}px`);
};

ImageAnnotator.prototype.update_toggles = function () {
  this.toggle('.translate_show', $('.result').is(':visible'));
  this.toggle('.shortcuts_show', $('.shortcuts').is(':visible'));
  this.toggle('.instructions_show', ($('.step:visible').size() > 0));
  this.toggle('.map_show', ($('#map:visible').size() > 0));
  this.toggle('.colour_show', $('.colours:visible').size() > 0);
};


/*  methods for placing objects on the surface */

ImageAnnotator.prototype.addTool = function (event) {
  if (surface.mode == 'transcription') {
    if (((new Date().getTime()) - surface.timeOfLastDrag) > 100 && !surface.hoveringOnMarker) {
      if (surface.shifting == false) {
        $('.marker').removeClass('selected');
      }

      /*  create a visual marker object */
      surface.selection = `TMP${new Date().getTime()}`;
      var zoom = $('#zoom').val();
      var marker_size = parseInt($('#m_size').val(), 10) * zoom;
      var x = (event.pageX - $('#fragment').offset().left);
      var y = (event.pageY - $('#fragment').offset().top);

      /*  find the center of click */
      var mx = x - (marker_size / 2);
      var my = y - (marker_size / 2);

      /* get selected label */
      var mclass = '';
      var label;
      if ($('.task-option-toggle.success').length) {
        mclass = $('.task-option-toggle.success').attr('lval');
        label = $('.task-option-toggle.success').attr('id').split('-')[0];
      } else {
        label = '';
      }

      /*  append the draggable element into html */
      var newMarker;
      if (typeof recording !== 'undefined') {
        $('.overlay.selected').hide();
        newMarker = `<div class='marker new selected unfinished ${mclass}' id='m-${surface.selection}' style='left: ${mx}px;top:${my}px;'><div class='character'></div><div id="m-${surface.selection}-overlay" class="overlay selected"><div class="txt" contenteditable></div></div></div>`;
      } else {
        newMarker = `<div class='marker new selected unfinished ${mclass}' id='m-${surface.selection}' style='left: ${mx}px;top:${my}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${surface.selection}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
      }
      $('#markers').append(newMarker);
      $(`#m-${surface.selection}`).draggable({
        start(e) { ms.dragTool(e); $('.delete-marker-btn').hide(); },
        stop(e) { ms.dropTool(e); $('.delete-marker-btn').hide(); },
      });

      $(`#m-${surface.selection}`).on('mouseenter', (e) => { ms.hoverToolOn(e); });
      $(`#m-${surface.selection}`).on('mouseleave', (e) => { ms.hoverToolOff(e); });

      /* increment the label's counter */
      if ($('.task-option-toggle.success').length) {
        if ($('.task-option-toggle.success div').attr('estimated') == 'true') {
          $('.task-option-toggle.success div')[0].innerHTML = '1';
          $('.task-option-toggle.success div').removeAttr('estimated');
        } else {
          /* check if this is the default value */
          if ($('.task-option-toggle.success div')[0].innerHTML == '?') {
            $('.task-option-toggle.success div')[0].innerHTML = '1';
          } else {
            /* just increment */
            $('.task-option-toggle.success div')[0].innerHTML = parseInt($('.task-option-toggle.success div')[0].innerHTML) + 1;
          }
        }
      }

      /* current rotation */
      var rotation = $('#rotation').val();

      /*  add the marker to the storage unit */
      surface.markers[surface.selection] = new Marker(x.toPrecision(3) / zoom, y.toPrecision(3) / zoom, label, rotation);
      // this.sendInterfaceUpdate({'create': 'test'});

      // create the annotation in the system
      this.client.create('annotation', {
        label: surface.markers[surface.selection].label,
        position: {
          x: surface.markers[surface.selection].x,
          y: surface.markers[surface.selection].y,
        },
      }, (annotation) => {
        // set the id of the annotation html element
        $(`#m-${surface.selection}`).attr('annotation-id', annotation.id);
      });
    }
  } else if (surface.mode == 'counting') {
    if (((new Date().getTime()) - surface.timeOfLastDrag) > 100 && !surface.hoveringOnMarker) {
      // Verify a label has been selected
      if ($('.task-option-toggle.success').length == 0) {
        alert('In order to start counting, you need to have a label selected at the bottom of the page (e.g. Tau)!');
        print('No label selected for counting.');
        return;
      }

      if (surface.shifting == false) {
        $('.marker').removeClass('selected');
      }

      /*  create a visual marker object */
      surface.selection = `TMP${new Date().getTime()}`;
      var zoom = parseFloat($('#zoom').val());
      var marker_size = parseInt($('#m_size').val(), 10) * zoom;
      var x = (event.pageX - $('#fragment').offset().left);
      var y = (event.pageY - $('#fragment').offset().top);

      /*  find the center of click */
      var mx = x - (marker_size / 2);
      var my = y - (marker_size / 2);

      /* get selected label */
      var mclass = '';
      var label;
      if ($('.task-option-toggle.success').length) {
        mclass = $('.task-option-toggle.success').attr('lval');
        label = $('.task-option-toggle.success').attr('id').split('-')[0];
      } else {
        label = '';
      }

      /*  append the draggable element into html */
      var newMarker;
      if (typeof recording !== 'undefined') {
        $('.overlay.selected').hide();
        newMarker = `<div class='marker new ${mclass}' id='m-${surface.selection}' style='left: ${mx}px;top:${my}px;'><div class='character'></div><div id="m-${surface.selection}-overlay" class="overlay selected"><div class="txt" contenteditable></div></div></div>`;
      } else {
        newMarker = `<div class='marker new ${mclass}' id='m-${surface.selection}' style='left: ${mx}px;top:${my}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${surface.selection}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
      }
      $('#markers').append(newMarker);
      $(`#m-${surface.selection}`).draggable({
        start(e) {
          ms.dragTool(e); $('.delete-marker-btn').hide();
        },
        stop(e) {
          ms.dropTool(e); $('.delete-marker-btn').hide();
        },
      });
      $(`#m-${surface.selection}`).on('mouseenter', (e) => { ms.hoverToolOn(e); });
      $(`#m-${surface.selection}`).on('mouseleave', (e) => { ms.hoverToolOff(e); });

      /* increment the label's counter */
      if ($('.task-option-toggle.success').length) {
        if ($('.task-option-toggle.success div').attr('estimated') == 'true') {
          $('.task-option-toggle.success div')[0].innerHTML = '1';
          $('.task-option-toggle.success div').removeAttr('estimated');
        } else {
          /* check if this is the default value */
          if ($('.task-option-toggle.success div')[0].innerHTML == '?') {
            $('.task-option-toggle.success div')[0].innerHTML = '1';
          } else {
            /* just increment */
            $('.task-option-toggle.success div')[0].innerHTML = parseInt($('.task-option-toggle.success div')[0].innerHTML) + 1;
          }
        }
      }

      /* current rotation */
      var rotation = $('#rotation').val();

      /*  add the marker to the storage unit */
      surface.markers[surface.selection] = new Marker(x.toPrecision(3) / zoom, y.toPrecision(3) / zoom, label, rotation);
      this.sendInterfaceUpdate({ create: 'test' });
    }
  }
};

ImageAnnotator.prototype.deleteTool = function (e) {
  // return if this is the help-giving annotation
  // if(e.target.id === 'help-giving-target') return;
  const that = this;
  /* decrement the counter */
  if (this.mode === 'counting') {
    const classList = $(e.currentTarget).attr('class');
    let className = classList.match(/\S*marker-n\d\S*/);
    if (className === null) {
      return;
    }

    className = className[0];
    $(`label[lval='${className}'] div`)[0].innerHTML = parseInt($(`label[lval='${className}'] div`)[0].innerHTML) - 1;
  }
  $('#markers .selected').each(function (i, m) {
    const mid = $(this).attr('id').replace('m-', '');

    /*  remove the marker in storage and from the view */
    delete surface.markers[mid];
    const annotation_id = $(`#m-${mid}`).attr('annotation-id');
    $(`#m-${mid}`).remove();

    // delete the annotation in the system
    that.client.delete('annotation', {
      id: annotation_id,
    }, (annotation) => {
      // print("Annotation ("+annotation_id+") deleted successfully.");
    });
  });

  /*  select the next marker, if there are any */
  if ($('.marker').size() > 0) {
    surface.select_next();
  }

  // event.preventDefault();
  $('.counter').html(`Click to Count: ${ms.countMarkers()}`);
  surface.hoveringOnMarker = false;
};

ImageAnnotator.prototype.deleteToolWithButton = function (ele) {
  const mid = ele.id.replace('m-', '');

  /*  remove the marker in storage and from the view */
  delete surface.markers[mid];
  const annotation_id = $(`#m-${mid}`).attr('annotation-id');
  $(`#m-${mid}`).remove();

  /*  select the next marker, if there are any */
  if ($('.marker').size() > 0) {
    surface.select_next();
  }

  // delete the annotation in the system
  this.client.delete('annotation', {
    id: annotation_id,
  }, (annotation) => {
    // print("Annotation ("+annotation_id+") deleted successfully.");
  });

  surface.hoveringOnMarker = false;
};

ImageAnnotator.prototype.deleteToolsByLabel = function (label) {
  /* store all ids to be deleted */
  const ids = [];

  /* iterate over the entire object */
  for (const key in ms.markers) {
    if (ms.markers.hasOwnProperty(key)) {
      const obj = ms.markers[key];
      if (obj.label == label) {
        ids.push(key);
      }
    }
  }

  /* remove all of the collected ids */
  for (let i = 0; i < ids.length; i++) {
    delete ms.markers[ids[i]];
  }
};

ImageAnnotator.prototype.setToolValue = function (event) {
  if (surface.selection == null || $('#help-giving-target').length > 0 || event.target.id == 'togetherjs-chat-input') {
    return false;
  }

  // Get character or diacritic
  const item = $('.character', '#markers .selected');

  let character;
  let diacritic;
  let key = event.target;

  /*  Did we click a Span element instead of the intended DIV? */
  if (event.target.tagName == 'SPAN') {
    key = event.target.parentNode;
  }

  // Diacritic
  if ($(key).parent().hasClass('diacritics')) {
    diacritic = $(key).html().split('&nbsp;')[0];
    $(item).html(diacritic + $(item).html().substr($(item).html().length - 1));
    surface.markers[surface.selection].updateLetter(diacritic + $(item).html().substr($(item).html().length - 1));
  }

  // Symbol
  if ($(key).parent().hasClass('symbol-container')) {
    console.log('Has class symbol-container');
    character = $(key).html();
    $(item).html(character);
    $(item).css('font-family', 'Grec-Subset');
    surface.markers[surface.selection].updateLetter(character);
  } else {
    $(item).css('font-family', '');
  }

  // Standard key
  if ($(key).parent().hasClass('standard')) {
    character = $('.u', key).html();
    // console.log("Attempting to add: &#"+character.charCodeAt(0)+";");
    $(item).html(`&#${character.charCodeAt(0)};`);
    surface.markers[surface.selection].updateLetter(character);
  }

  const that = this;
  function loopUntilUpdated(id, character) {
    const annotation_id = $(id).attr('annotation-id');
    if (annotation_id) {
      that.client.update('annotation', {
        id: annotation_id,
        label: character,
      }, (annotation) => {
        // set the id of the annotation html element
        print(`Annotation's character (${annotation_id}) updated successfully.`);
      });
    } else {
      setTimeout(() => {
        loopUntilUpdated(id, character);
      }, 1000);
    }
  }

  loopUntilUpdated(`#m-${surface.selection}`, character);

  if ($(`#m-${surface.selection}`).hasClass('hovering')) {
    $(item).css('font-size', '36px');
    $(item).css('top', '20px');
  }

  $('#markers .selected').each((i, m) => {
    const mid = surface.selection;

    // Add custom class
    let custom = false;
    if ($(key).parent().hasClass('custom') || $(key).parent().hasClass('custom')) {
      $(item).addClass('custom');
      custom = true;
    } else {
      $(item).removeClass('custom');
    }
    // OXU.queue.process_character(mid);
    $(`#m-${mid}`).removeClass('unfinished');

    // Add solid class (but not for spaces or if hidden)
    if (escape(character) != '%20' && $('#toggle_solid').hasClass('on')) {
      $(`#m-${mid}`).addClass('solid');
      $(`#m-${mid}`).css('opacity', 1.0);
    } else {
      $(`#m-${mid}`).removeClass('solid');
    }

    // Characters are hidden (do fade in / fade out)
    if (!$('#toggle_solid').hasClass('on')) {
      $(`#m-${mid}`).show();
      $('.character', `#m-${mid}`).show();
      $(`#m-${mid}`).css('opacity', 1.0);

      $('.character', `#m-${mid}`).delay(50).fadeTo('fast', $('#m_opacity').val(), () => {
        $(`#m-${mid}`).fadeTo('fast', $('#m_opacity').val(), () => {
          // $(".character", "#m-"+mid).hide();
          $('.character', `#m-${  mid}`).css('opacity', 1.0);
        });
      });
    }
  });

  if ($('.marker').size() > 0) {
    if ($('#markers .selected').size() > 1) {
      $('.marker').removeClass('selected');
    } else {
      surface.select_next();
    }
  }

  /* show the help tooltip */
  if (typeof help_behavior !== 'undefined') {
    const first_time = localStorage.getItem('crowdcurio-agent-first-time') || 0;

    if (first_time === 0) {
      const cur_position = $(`#m-${surface.selection}`).position();
      const tooltip = $('#togetherjs-first-time-annotation');
      tooltip.css('top', `${cur_position.top - 50}px`);
      tooltip.css('left', `${cur_position.left - 50}px`);
      tooltip.animate({ opacity: 1 });

      localStorage.setItem('crowdcurio-agent-first-time', 1);

      setTimeout(() => {
        tooltip.animate({ opacity: 0 });
      }, 8000);
    }
  }

  surface.resizeFont($('#zoom').val());
  event.preventDefault();
};

ImageAnnotator.prototype.selectTool = function (event) {
  if (ms.mode === 'transcription') {
    let e = event.target;
    if (surface.shifting == false) {
      $('.marker').removeClass('selected');
    }

    /*   verify we clicked the right object */
    // console.log($(event.target).attr('class'));
    if ($(event.target).attr('class').indexOf('character') > -1) {
      e = event.target.parentNode;
    }

    if ($(e).hasClass('ui-draggable') && !surface.movingMarker) {
      $('.item').removeClass('selected');
      $(e).addClass('selected');
      surface.selection = $(e).attr('id').replace('m-', '');
    }
  }
};

ImageAnnotator.prototype.dragTool = function (e) {
  /*  turn on the drag state */
  surface.movingMarker = true;
};

ImageAnnotator.prototype.dropTool = function (event) {
  // console.log('marker dragstop!');
  const zoom = $('#zoom').val();
  const marker_size = parseInt($('#m_size').val(), 10) * zoom;

  // Account for markersize
  const x = $(event.target).position().left + (marker_size / 2) + 20;
  const y = $(event.target).position().top + (marker_size / 2) + 20;

  /*  This might still be necessary? */
  const point = surface.point_to_base(x, y);

  /* update the marker */
  //console.log(event.target.id.split('-')[1]);
  surface.markers[event.target.id.split('-')[1]].updatePoint(x.toPrecision(3) / zoom, y.toPrecision(3) / zoom, surface.rotationDegree);
  const annotation_id = $(`#m-${event.target.id.split('-')[1]}`).attr('annotation-id');
  // delete the annotation in the system
  this.client.update('annotation', {
    id: annotation_id,
    position: {
      x: x.toPrecision(3) / zoom,
      y: y.toPrecision(3) / zoom,
    },
  }, (annotation) => {
    // print("Annotation's postion ("+annotation_id+") updated successfully.");
  });
  // console.log(surface.markers);
  //    console.log('from:                     angle: ' + surface.rotationDegree);
  //    console.log('x: ' + x + " y: " + y);
  //    console.log('to: ')
  //    console.log('x: ' + point.x + ' y: ' + point.y);

  /*  turn off the drag state */
  surface.movingMarker = false;
  event.stopPropagation();
};

ImageAnnotator.prototype.hoverToolOn = function (e) {
  if (surface.movingMarker) {
    return;
  }

  this.hoveringOnMarker = true;
  const ele = $(e.currentTarget);
  ele.addClass('hovering');
  const marker = this.markers[ele.attr('id').split('-')[1]];
  const zoom = parseFloat($('#zoom').val());
  let scaler;
  if (zoom === 0.75) {
    scaler = 1.25;
  } else if (zoom === 0.5) {
    scaler = 1.5;
  } else if (zoom === 1.25) {
    scaler = 0.75;
  } else if (zoom === 1.5) {
    scaler = 0.5;
  } else {
    scaler = 1.0;
  }
  ele.animate({
    top: `${zoom * (parseInt(marker.y) - (30 * scaler))}px`, left: `${zoom * (parseInt(marker.x) - (30 * scaler))}px`, height: '60px', width: '60px', 'border-radius': '100px',
  }, 50);

  $(`#${e.currentTarget.id} > .character`).css('opacity', 0.0);

  /*  forcefully turn on draggability of the fragment image */
  $('#fragment_container').draggable('option', 'disabled', true);

  if (!($('#toggle_solid').hasClass('on')) && $('.character', this).html() != '') {
    $(this).css('opacity', 0.9);
    $('.character', this).css('opacity', 1.0);
    $('.character', this).show();
  }
};

ImageAnnotator.prototype.hoverToolOff = function (e) {
  if (surface.movingMarker) {
    return;
  }
  this.hoveringOnMarker = false;
  const ele = $(e.currentTarget);
  ele.removeClass('hovering');
  const marker = this.markers[ele.attr('id').split('-')[1]];
  const markerSize = parseInt($('#m_size').val(), 10);
  const zoom = parseFloat($('#zoom').val());
  let scaler;
  if (zoom === 0.75) {
    scaler = 1.25;
  } else if (zoom === 0.5) {
    scaler = 1.5;
  } else if (zoom === 1.25) {
    scaler = 0.75;
  } else if (zoom === 1.5) {
    scaler = 0.5;
  } else {
    scaler = 1.0;
  }
  ele.animate({
    top: `${zoom * (parseInt(marker.y) - (10 * scaler))}px`, left: `${zoom * (parseInt(marker.x) - (10 * scaler))}px`, height: '20px', width: '20px',
  }, 50);

  const character = $(`#${e.currentTarget.id} > .character`);
  character.css('opacity', 1.0);
  character.css('font-size', '12px');
  character.css('top', '0px');


  /*  forcefully turn off draggability of the fragment image */
  $('#fragment_container').draggable('option', 'disabled', false);

  if (!($('#toggle_solid').hasClass('on')) && $('.character', this).html() != '') {
    $(this).css('opacity', $('#m_opacity').val());
    $('.character', this).hide();
  }
};

ImageAnnotator.prototype.toggleMarkerTransparency = function (event) {
  // Show characters
  if ($(event.target).hasClass('on')) {
    $('.marker').removeClass('solid');
    $('.character', '.marker').hide();
    $(event.target).removeClass('on');
    $('#mode_tip').html('Show');
    $('.marker').css('opacity', $('#m_opacity').val());
  } else {
    $('.marker, .character').stop();
    $('.marker').removeClass('solid');
    $('.marker').each((i, m) => {
      if ($('.character', m).html() != '' && (escape($('.character', m).html()) != '%20')) {
        $(m).addClass('solid');
      }
    });
    $('.solid').css('opacity', 0.9);
    $('.character').css('opacity', 1.0);
    $('.character').show();
    $(event.target).addClass('on');
    $('#mode_tip').html('Hide');
  }
  event.preventDefault();
};

ImageAnnotator.prototype.toggleAutoTraversal = function (event) {
  const set = $(event.target).hasClass('on');
  if (set == true) {
    $(event.target).removeClass('on');
  } else {
    $(event.target).addClass('on');
  }
  event.preventDefault();
};

ImageAnnotator.prototype.select_next = function (force) {
  if ($('#toggle_next').hasClass('on') || force) {
    if ($('#markers .selected').size() < 1) {
      $('.marker').first().addClass('selected');
      surface.selection = $($('.marker').first()).attr('id').replace('m-', '');
      console.log('updated selection');
    }
    const mid = $('#markers .selected').attr('id').split('-')[1];
    const items = surface.sortTools(true);
    let found = false;
    let nid;
    $(items).each((i, m) => {
      if (found) {
        nid = m.id;
        return false;
      }
      if (!found && m.id == mid) {
        found = true;
        return true;
      }
    });

    if (nid != undefined) {
      $('.marker').removeClass('selected');
      $(`#m-${nid}`).addClass('selected');
      const x = $(`#m-${nid}`).position().left;
      const y = $(`#m-${nid}`).position().top;
      surface.map.repositionFragment(x, y);

      /* update the global selection */
      surface.selection = nid;
    }
  }
};

ImageAnnotator.prototype.sortTools = function (create) {
  const items = new Array();
  $('.marker').each((i, m) => {
    const marker = new Object();
    marker.id = $(m).attr('id').split('-')[1];
    marker.x = $(m).position().left;
    marker.y = $(m).position().top;
    items.push(marker);
  });

  items.sort(surface.do_sort);
  if (create) {
    return items;
  }
};

ImageAnnotator.prototype.do_sort = function (a, b) {
  const line_size = 30 * parseFloat($('#zoom').val());

  // Same position
  if ((a.y == b.y) && (a.x == b.x)) {
    return 0;
  }

  // Marker A and B are in line
  if ((a.y < b.y + line_size) && (a.y > b.y - line_size)) {
    // Marker A is first if left less than B
    if (a.x < b.x) {
      return -1;
    }
    return 1;
  }

  // Marker A and B are different lines
  if (a.y < b.y) {
    return -1;
  }
  return 1;
};

ImageAnnotator.prototype.updateKeypadExample = function (event) {
  $('.example_label').hide();
  $('#variations h2:visible').hide();
  if ($('.u', event.target).html() != null) {
    $('.key_label').html($('.label', event.target).html());
    $('#variations').attr('class', '');
    $('#variations').addClass($(event.target).attr('id').toLowerCase());
    $('.examples').show();
  }
};


ImageAnnotator.prototype.rotate = function (pointX, pointY, angle, offsetX, offsetY) {
  // convert angle to radians
  angle = angle * Math.PI / 180.0;

  // rotate around origin
  const centerX = 0;
  const centerY = 0;

  // get coordinates relative to center
  const dx = pointX - centerX;
  const dy = pointY - centerY;

  // calculate angle and distance
  const a = Math.atan2(dy, dx);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // calculate new angle
  const a2 = a + angle;

  // calculate new coordinates
  const dx2 = Math.cos(a2) * dist;
  const dy2 = Math.sin(a2) * dist;

  // return coordinates with offset
  return { x: dx2 + offsetX, y: dy2 + offsetY };
};

ImageAnnotator.prototype.zoom = function (current_factor, factor) {
  const org_height = $('#fragment img').height();
  $('#fragment img').width(($('#fragment img').width() / current_factor) * factor);
  $('#fragment img').height((org_height / current_factor) * factor);

  // re calculate the margin when the imag rotate to 90 or 270
  const current = $('#rotation').val();
  if (current == 90 || current == 270) {
    const img = $('#fragment img');
    const d = $('#fragment img').width() - $('#fragment img').height();
    img.css('margin-left', -d / 2);
    img.css('margin-top', d / 2);
  }

  surface.scale_items(current_factor, factor);
  // surface.scale_items_measure(current_factor, factor);
  $('#zoom').val(factor);
  // console.log("Updating Zoom Factor to: "+factor);

  /*
    // Scale fragment container position
    var fc_top = $("#fragment_container").position().top;
    var fc_left = $("#fragment_container").position().left;
    fc_top = (fc_top/current_factor)*factor;
    fc_left = (fc_left/current_factor)*factor;
    $("#fragment_container").css("top", fc_top+"px");
    $("#fragment_container").css("left", fc_left+"px");
    */

  if ($('#map').is(':visible')) {
    surface.map.resize_map(true);
  }

  if ($('#zoom').val() == factor) {
    $('#fragment').append($('#fragment_id').html());
    $(this).remove();
    // Delay fade in by 10ms if rotated
    const delay = ($('#rotation').val() > 0) ? 100 : 0;
    setTimeout(() => {
      $('#fragment img:not(:last)').fadeOut('slow', function () {
        $(this).remove();
      });
    }, delay);
  }
};

ImageAnnotator.prototype.scale_items = function (currentFactor, factor) {
  if ($('.marker').length > 0) {
    $('.marker').each((i, marker) => {
      // Calculate base position
      const baseX = $(marker).position().left / currentFactor;
      const baseY = $(marker).position().top / currentFactor;

      // Scale
      const sx = Math.round(baseX * (factor));
      const sy = Math.round(baseY * (factor));

      $(marker).css('left', `${sx}px`);
      $(marker).css('top', `${sy}px`);

      //
      // var id = $(marker).attr('id').split('-')[1];
      // ms.markers[id]['x'] = sx+10;
      // ms.markers[id]['y'] = sy+10;
    });

    // Scale circles
    const markerSize = parseInt($('#m_size').val(), 10);
    $('.marker').css('width', markerSize * factor);
    $('.marker').css('height', markerSize * factor);
    surface.resizeFont(factor);
  }
};

ImageAnnotator.prototype.zoom_in = function (event) {
  // if (!$(event.target).hasClass("disabled") && ($("#status").attr("class") == "")) {
  const current_factor = $('#zoom').val();
  const factor = parseFloat(current_factor) + parseFloat($('#zoom_step').val());
  surface.zoom(current_factor, factor);

  // Reactivate zoom out
  if ($('.zoom_out').hasClass('disabled')) {
    $('.zoom_out').removeClass('disabled');
  }
  if (factor >= $('#maxzoom').val()) {
    $('.zoom_in').addClass('disabled');
  }
  // }
  event.preventDefault();
};

ImageAnnotator.prototype.zoom_out = function (event) {
  // if (!$(event.target).hasClass("disabled") && ($("#status").attr("class") == "")) {
  const current_factor = $('#zoom').val();
  const factor = parseFloat(current_factor) - parseFloat($('#zoom_step').val());
  surface.zoom(current_factor, factor);

  // Reactivate zoom in
  if ($('.zoom_in').hasClass('disabled')) { $('.zoom_in').removeClass('disabled'); }
  if (factor <= $('#minzoom').val()) { $('.zoom_out').addClass('disabled'); }
  // }
  event.preventDefault();
};


/* measure methods */
// Add Measurement
ImageAnnotator.prototype.addMargin = function (event) {
  if (surface.dragmode == false) {
    surface.cancel();
  } else {
    surface.dragmode = false;
    $('#fragment_container').draggable('option', 'disabled', true);
    const region = $(event.target).parent().attr('id');
    // var region = 'top';   // just for test
    surface.region = region;
    $('.add').removeClass('active');
    $(this).addClass('active');
  }
  event.preventDefault();
};

ImageAnnotator.prototype.add = function (event) {
  event.preventDefault();
};


ImageAnnotator.prototype.columnAdd = function (event) {
  $('.add', $(event.target).parent().parent()).trigger('click');
  e.preventDefault();
};


// ----------------------------------------
// CLICK
// ----------------------------------------
ImageAnnotator.prototype.beginMeasure = function (e) {
  /*    place initial marker for measure */
  if (!surface.dragmode) {
    const offset = $('#measurements').offset();
    m = new Object();
    x1 = e.pageX - offset.left;
    y1 = e.pageY - offset.top;

    m.x1 = x1;
    m.y1 = y1;
    m.region = surface.region;

    surface.dragging = true;
    e.stopPropagation();

    $('#fragment_container').append("<div id='current-mm' class='measurement' style='display:none;'></div>");
    m.id = `TMP${new Date().getTime()}`;
    surface.add_result(m, true);
  }
};

//--------------------------------------
// DRAG
//--------------------------------------
ImageAnnotator.prototype.startMove = function (e) {
  if (!surface.dragmode) {
    let offset = $('#viewer').offset();
    const mx = e.pageX - offset.left;
    const my = e.pageY - offset.top;

    if (surface.dragging) {
      surface.draw();
      offset = $('#measurements').offset();
      x = e.pageX - offset.left;
      y = e.pageY - offset.top;
      surface.ctx.beginPath();
      surface.ctx.moveTo(x1, y1);
      surface.ctx.lineTo(x, y);
      surface.ctx.strokeStyle = 'red';
      surface.ctx.stroke();
      surface.ctx.beginPath();
      surface.ctx.moveTo(x1 + 1, y1 + 1);
      surface.ctx.lineTo(x + 1, y + 1);
      surface.ctx.strokeStyle = '#fff';
      surface.ctx.stroke();

      // Label
      if (!$('#current-mm').is(':visible')) { $('#current-mm').show(); }
      $('#current-mm').css('left', (`${surface.label(x, y, x1, y1).x}px`));
      $('#current-mm').css('top', (`${surface.label(x, y, x1, y1).y}px`));
      $('#current-mm').html(`${surface.distance_coords(x, y, x1, y1)}<span class='unit'>px</span>`);
      surface.update_result(surface.distance_coords(x, y, x1, y1), m.id);

      // Auto scroll hot regions
      const v_offset = $('#viewer').offset();
      const vx = (e.pageX - v_offset.left);
      const vy = (e.pageY - v_offset.top);

      // if (vy > 280) {OXU.navigate.down(true);}
      // if (vy < 20) { OXU.navigate.up(true);}
      // if (vx > 863) { OXU.navigate.right(true);}
      // if (vx < 20) { OXU.navigate.left(true);}
    }
    e.stopPropagation();
  }
};

//--------------------------------------------
// RELEASE
//--------------------------------------------
ImageAnnotator.prototype.EndMeasure = function (e) {
  console.log('mouseup on #viewer');
  if (surface.dragging) {
    const offset = $('#measurements').offset();
    m.x2 = e.pageX - offset.left;
    m.y2 = e.pageY - offset.top;

    // surface.measurements.push(m);
    surface.measurements[m.id] = new Measurement(m.id, surface.region, m.x1, m.y1, m.x2, m.y2);
    // surface.measurements[m.id] = new Measurement(m.id, surface.region, m.x1, m.y1, m.x2, m.y2);
    // console.log(surface.measurements);
    // OXU.queue.create(m);

    const label = surface.label(m.x1, m.y1, m.x2, m.y2);
    $('#fragment_container').append(`<div id='mm-${m.id}' class='measurement' style='top:${label.y}px;left:${label.x}px;'>${surface.distance(m)}<span class='unit'>px</span></div>`);

    //  Reset canvas
    surface.draw();
    surface.dragging = false;
    surface.dragmode = true;
    $('#fragment_container').draggable('option', 'disabled', false);
    surface.region = '';
    $('.add').removeClass('active');
    $('#current-mm').remove();
  }
};

ImageAnnotator.prototype.OverMidpoint = function (e) {
  $('.delete', e.target).css('opacity', 1.0);
  const mid = surface.id(e.target);
  surface.draw(mid);
};

ImageAnnotator.prototype.OutMidpoint = function (e) {
  $('.delete', e.target).css('opacity', 0.5);
  surface.draw();
};

ImageAnnotator.prototype.id = function (element) {
  return $(element).attr('id').split('-')[1];
};

ImageAnnotator.prototype.cancel = function () {
  surface.dragmode = true;
  $('#fragment_container').draggable('option', 'disabled', false);
  surface.region = '';
  $('.add').removeClass('active');
};

ImageAnnotator.prototype.delete = function (e) {
  const mid = surface.id($(e.target).parent());
  // var reg = $(e.target).parent().parent().attr("id");

  // Special case for paginated column results
  let column = false;
  $(e.target).parents().map(function () { if ($(this).attr('id') == 'column') column = true; });
  if (column) {
    surface.remove_item(`#${$(e.target).parent().attr('id')}`, $('.add:hidden', '#column'));
  } else {
    $('.add', $(e.target).parent().parent()).show();
    $(e.target).parent().remove();
  }

  // delete surface.measurements[reg];
  delete surface.measurements[mid];

  surface.draw();
  $(`#mm-${mid}`).remove();
};

ImageAnnotator.prototype.draw = function (currentID) {
  surface.ctx.clearRect(0, 0, $('#measurements').width(), $('#measurements').height());
  let i;
  for (i in surface.measurements) {
    const cm = surface.measurements[i];
    surface.ctx.beginPath();
    surface.ctx.moveTo(cm.x1, cm.y1);
    surface.ctx.lineTo(cm.x2, cm.y2);
    if (cm.id == currentID) {
      surface.ctx.strokeStyle = '#7FF6FF';
    } else {
      surface.ctx.strokeStyle = '#00C2FF';
    }
    surface.ctx.stroke();

    surface.ctx.beginPath();
    surface.ctx.moveTo(cm.x1 + 1, cm.y1 + 1);
    surface.ctx.lineTo(cm.x2 + 1, cm.y2 + 1);
    surface.ctx.strokeStyle = '#ffffff';
    surface.ctx.stroke();
  }
};


ImageAnnotator.prototype.add_result = function (m, saved) {
  const classes = (saved) ? 'result' : 'new result';
  const item = `<div class='${classes}' id='m-${m.id}'><div class='delete'>x</div><div class='number'>0<span class='unit'>px</span></div></div>`;
  if (m.region == 'column') {
    surface.handle_new_item(item, $('.add:visible', '#column'));
  } else {
    $('.add', `#${m.region}`).after(item);
    $('.add', `#${m.region}`).hide();
  }
};


ImageAnnotator.prototype.update_result = function (distance, mid) {
  $('.number', `#m-${mid}`).html(`${distance}<span class='unit'>px</span>`);
};


ImageAnnotator.prototype.distance_coords = function (x1, y1, x2, y2) {
  const m = new Object();
  m.x1 = x1;
  m.y1 = y1;
  m.x2 = x2;
  m.y2 = y2;
  return surface.distance(m);
};

ImageAnnotator.prototype.distance = function (m) {
  const startPoint = surface.point_to_base(m.x1, m.y1);
  const endPoint = surface.point_to_base(m.x2, m.y2);
  return Math.round(Math.sqrt(Math.pow((endPoint.x - startPoint.x), 2) + Math.pow((endPoint.y - startPoint.y), 2)));
};

ImageAnnotator.prototype.point_to_base = function (px, py) {
  // Create basepoint
  let basePoint = { x: px, y: py };

  // Current state
  const rotation = $('#rotation').val();
  let width = $('#fragment img').width();
  let height = $('#fragment img').height();

  if (rotation == 90 || 270) { const temp = width; }
  width = height;
  height = width;

  // Shift back to offset (quarter)
  if (rotation == 0) { basePoint.x -= width; }
  if (rotation == 180) { basePoint.x -= width; basePoint.y -= height; }
  if (rotation == 270) { basePoint.y -= height; }

  // Perform rotation
  if (rotation != 0) {
    basePoint = surface.rotate(basePoint.x, basePoint.y, 0 - rotation, 0, 0);
  }

  // Rescale coordinates
  basePoint.x /= $('#zoom').val();
  basePoint.y /= $('#zoom').val();
  return basePoint;
};

ImageAnnotator.prototype.label = function (x1, y1, x2, y2) {
  const l = new Object();
  l.x = ((x1 + (x2 - x1) / 2) - 20);
  l.y = ((y1 + (y2 - y1) / 2) - 10);
  return l;
};


// Pagination functions for measure column items

ImageAnnotator.prototype.clickToPage = function (e) {
  const page = parseInt(surface.id(e.target), 10);
  surface.to_page(page);
};


ImageAnnotator.prototype.handle_new_item = function (result, add_element) {
  // Last page has space
  if ($('.page:last .result').length < surface.page_size) {
    $('.page:last').append(result);
  } else {
    surface.new_page(result);
  }

  if (surface.show_last) surface.to_page(surface.id('.page:last'));

  // Hide 'add' element if there is no more space and we were asked to
  if (add_element && !surface.spaces()) $(add_element).hide();
};


ImageAnnotator.prototype.new_page = function (result) {
  const new_no = $('.page').length + 1;
  $('.pages').append(`<div class='page' id='pg-${new_no}'></div>`);
  $('.page:last').append(result);
  $('.controls').append(`<span class='item' id='pc-${new_no}'></span>`);
  surface.resize_page_container();
};


ImageAnnotator.prototype.to_page = function (page) {
  const current_page = parseInt(surface.id('.pages .current'), 10);
  const difference = (page - current_page);
  $('.controls .item').removeClass('current');
  $(`#pc-${page}`).addClass('current');

  if (surface.animate1) {
    $('.pages').animate({ left: `${1 - ((page - 1) * $('.page').outerWidth(true))}px` }, () => {
      $('.pages div').removeClass('current');
      $(`#pg-${page}`).addClass('current');
    });
  } else {
    $('.pages').css('left', `${1 - ((page - 1) * $('.page').outerWidth(true))}px`);
    $('.pages div').removeClass('current');
    $(`#pg-${page}`).addClass('current');
  }
};


ImageAnnotator.prototype.remove_item = function (item_id, add_element) {
  const item = $(item_id);
  const current_page = parseInt(surface.id($(item).parent()), 10);
  $('.number', item).fadeOut(surface.fade_time, () => {
    $(item).slideUp(surface.slide_time, () => {
      $(item).remove();
      const total_pages = $('.page').length;

      // Shift elements
      let i;
      for (i = current_page; i < total_pages; i++) {
        $(`#pg-${i + 1 } .result:first`).appendTo(`#pg-${i}`);
      }

      // Last page is empty
      if ($('.page:last .result').length == 0 && total_pages > 1) {
        if (current_page == total_pages && total_pages > 1) surface.to_page(total_pages - 1);
        surface.remove_page(total_pages);
      }

      // Show 'add' element if there is space and we were asked to
      if (add_element && surface.spaces()) $(add_element).show();
    });
  });
};


ImageAnnotator.prototype.resize_page_container = function () {
  $('.pages').width($('.page').outerWidth(true) * $('.page').length);
  if ($('.page').length == 1) {
    $('.controls:visible').fadeOut();
  } else {
    $('.controls:hidden').fadeIn();
  }
};

ImageAnnotator.prototype.remove_page = function (page_no) {
  $(`#pg-${page_no}`).remove();
  $(`#pc-${page_no}`).remove();
  surface.resize_page_container();
};


ImageAnnotator.prototype.spaces = function () {
  return (($('.page').length < surface.max_pages) || ($('.page').length == surface.max_pages && ($('.page:last .result').length < surface.page_size)));
};

ImageAnnotator.prototype.reset = function (animate1) {
  $('.pages').html("<div class='page current' id='pg-1'></div>");
  $('.controls').html("<span class='item current' id='pc-1'></div>");
  animate1 ? $('.controls:visible').fadeOut('fast') : $('.controls:visible').hide();
  surface.resize_page_container();
};


/* Measure rotation  */

/* rotation */
ImageAnnotator.prototype.rotateMeasure = function (event) {
  if ($('#status').attr('class') == '') {
    $('#status').addClass('processing');
    const current = $('#rotation').val();
    const width_org = $('#fragment img').width();
    const height_org = $('#fragment img').height();

    const f_src = $('#fragment img').attr('src');

    const thumb_src = $('#map img').attr('src');
    const thumb_h = $('#map img').attr('height');
    const thumb_w = $('#map img').attr('width');

    const degree_step = 90;
    const map_visible = $('#map').is(':visible');
    $('#map .location').hide();
    // $("#map").fadeOut(0, function() {
    // $("#map img").remove();
    // });

    surface.map.map_initalized = false;
    // Create new image and assign source
    const fragment_img = new Image(width_org, height_org);
    fragment_img.src = f_src;
    fragment_img.className = 'subject';

    // Create new thumbs image and assign width, height and src along with id
    const thumb_img = new Image(thumb_w, thumb_h);
    thumb_img.src = thumb_src;
    thumb_img.id = 'thumb';

    let new_rotation = parseInt(current, 10) + parseInt(degree_step, 10);

    if (new_rotation < 0) {
      new_rotation = 360 + new_rotation;
    }

    if (new_rotation == 360) {
      new_rotation = 0;
    } else {
      new_rotation;
    }

    // width and height of the fragments on rotation
    if (new_rotation == 0 || new_rotation == 180) {
      width = height_org;
      new_thumb_w = thumb_h;
    } else {
      width = width_org;
      new_thumb_w = thumb_w;
    }

    if (new_rotation == 0 || new_rotation == 180) {
      height = width_org;
      new_thumb_h = thumb_w;
    } else {
      height = height_org;
      new_thumb_h = thumb_h;
    }


    $('#fragment_url').val(fragment_img.src);
    $('#thumb_url').val(thumb_img.src);
    $('#rotation').val(new_rotation);


    // surface.hide_items_measure();

    // Add fresh images
    // $("#fragment img").remove();
    // $("#fragment").append(fragment_img);
    // $("#map .map_container").prepend(thumb_img);

    // main fragment rotation
    surface.step += 1;
    const img = $('#fragment img');
    img.css('transform', `rotate(${new_rotation}deg)`);
    const d = width - height;
    img.css('margin-left', -d / 2 * (surface.step % 2));
    img.css('margin-top', d / 2 * (surface.step % 2));

    // Thumb image roation
    const t_img = $('#map img');
    t_img.css('transform', `rotate(${new_rotation}deg)`);
    const td = new_thumb_w - new_thumb_h;
    t_img.css('margin-left', -td / 2 * (surface.step % 2));
    t_img.css('margin-top', td / 2 * (surface.step % 2));

    $('.map_container').css('width', new_thumb_h);
    $('.map_container').css('height', new_thumb_w);


    // Thumb has loaded
    $('#thumb').one('load', () => {
      surface.map.map_check(thumb_img, fragment_img);
      if (map_visible) $('#map').show();
    }).each(function () {
      thumb_img.src = $('#thumb_url').val();
      if (event.target.complete) $(this).load();
    });

    // New fragment has loaded
    $('#fragment img').one('load', () => {
      surface.rotate_items_measure(degree_step, width, height);
      // surface.show_items_measure();
      surface.map.map_check(thumb_img, fragment_img);
      $('#status').removeClass('processing');
    }).each(function () {
      fragment_img.src = $('#fragment_url').val();
      if (this.complete) $(this).load();
    });

    surface.rotationDegree += 90;
    if (surface.rotationDegree == 360) { surface.rotationDegree = 0; }
  }
  event.preventDefault();
};

ImageAnnotator.prototype.resetImageAttributes = function () {
  $('#fragment img').attr('style', '"transform: rotate(0deg); margin-top: 0px; margin-left: 0px;"');
  $('#map img').attr('style', '"transform: rotate(0deg); margin-top: 0px; margin-left: 0px;"');

  $('#fragment_url').val(' ');
  $('#thumb_url').val('');
  $('#rotation').val(0);
  surface.step = 0;

  $('.map_container').attr('style', '');

  $('#zoom').val(1.00);
  $('#fragment_id').val('');
  $('#m_size').val(20);
  $('#m_colour').val('#0B93E2');
  $('#m_opacity').val(0.3);

  $('#maxzoom').val(1.50);
  $('#minzoom').val(0.50);
  $('#zoom_step').val(0.25);
  $('#save_interval').val(20000);
  $('#m_default_size').val(20);
  $('#font_size').val(8);
  $('#compact').val('false');
};


ImageAnnotator.prototype.scale_items_measure = function (currentFactor, factor) {
  if (surface.measurements) {
    let i;
    for (i in surface.measurements) {
      const cm = surface.measurements[i];
      cm.x1 = (cm.x1 / currentFactor) * factor;
      cm.y1 = (cm.y1 / currentFactor) * factor;
      cm.x2 = (cm.x2 / currentFactor) * factor;
      cm.y2 = (cm.y2 / currentFactor) * factor;
      $(`#mm-${cm.id}`).css('left', `${surface.label(cm.x1, cm.y1, cm.x2, cm.y2).x}px`);
      $(`#mm-${cm.id}`).css('top', `${surface.label(cm.x1, cm.y1, cm.x2, cm.y2).y}px`);
    }
    surface.scale_canvas_measure(currentFactor, factor);
    surface.draw();

    // Reactiveate
    $('#fragment img').load(() => {
      $('#status').removeClass('processing');
    });
  }
};

Object.size = function (obj) {
  let size = 0,
    key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

ImageAnnotator.prototype.rotate_items_measure = function (amount, width, height) {
  /* rotate the canvas of the measurement */
  surface.rotate_canvas_measure(amount);

  if (Object.size(surface.measurements)) {
    let i;
    for (i in surface.measurements) {
      const cm = surface.measurements[i];
      const startPoint = surface.rotate(cm.x1, cm.y1, amount, height, 0);
      const endPoint = surface.rotate(cm.x2, cm.y2, amount, height, 0);
      cm.x1 = startPoint.x;
      cm.y1 = startPoint.y;
      cm.x2 = endPoint.x;
      cm.y2 = endPoint.y;

      $(`#mm-${cm.id}`).css('left', `${surface.label(cm.x1, cm.y1, cm.x2, cm.y2).x}px`);
      $(`#mm-${cm.id}`).css('top', `${surface.label(cm.x1, cm.y1, cm.x2, cm.y2).y}px`);
    }

    surface.draw();

    // Reactiveate
    $('#status').removeClass('processing');
  }

  $('.marker').each((i, marker) => {
    const mid = $(marker).attr('id').split('-')[1];
    const x = $(marker).position().left;
    const y = $(marker).position().top;
    const point = surface.rotate(x, y, amount, height, 0);
    $(`#m-${mid}`).css('left', `${point.x - $(marker).width()}px`);
    $(`#m-${mid}`).css('top', `${point.y}px`);
  });

  // Reactivate
  $('#status').removeClass('Loading');
};

ImageAnnotator.prototype.scale_canvas_measure = function (currentFactor, factor) {
  const c = document.getElementById('measurements');
  c.height = (c.height / currentFactor) * factor;
  c.width = (c.width / currentFactor) * factor;
};

ImageAnnotator.prototype.rotate_canvas_measure = function (amount) {
  const c = document.getElementById('measurements');
  if (amount == 90 || amount == 270) {
    const oldHeight = c.height;
    c.height = c.width;
    c.width = oldHeight;
  }
};

ImageAnnotator.prototype.resize_canvas_measure = function (dim) {
  canvas.height = isNaN(dim.height) ? $('#fragment img').height() : dim.height;
  canvas.width = isNaN(dim.width) ? $('#fragment img').width() : dim.width;
};

ImageAnnotator.prototype.hide_items_measure = function () {
  $('#measurements').hide();
  $('.measurement').hide();
};

ImageAnnotator.prototype.show_items_measure = function () {
  $('#measurements').show();
  $('.measurement').show();
};

/* for markrs when roate */
ImageAnnotator.prototype.hide_items = function () {
  $('.marker').css('visibility', 'hidden');
};

ImageAnnotator.prototype.show_items = function () {
  $('.marker').css('visibility', 'visible');
};

ImageAnnotator.prototype.toggleFullscreen = function (e) {
  const main_interface = $('#main-interface');
  const main = $('#main');
  const map = $('#map');
  const crowdcurio_nav_bar = $('#crowdcurio-navigation-main');
  const detection_ui = $('#detection_task_interface');
  const view_dividers = $('.view-divider');
  const viewer = $('#viewer');
  const bottom_controls = $('#bottom-controls');
  const bottom_controls_keypad = $('#bottom-control-keypad');
  const task_container = $('#task-container');
  const task_row_container = $('#task-row-container');
  const zoom_view_toggles = $('#zoom_view_toggles');
  const practice_toggles = $('#practice_toggles');
  const practice_submission_toggles = $('#practice_submission_toggles');
  const practice_validation_toggles = $('#practice_validation_toggles');
  const submission_toggles = $('#submission_toggles');
  const practice_toggles_inner = $('#practice_toggles_inner');
  const practice_submission_toggles_inner = $('#practice_submission_toggles_inner');
  const submission_toggles_inner = $('#submission_toggles_inner');
  const primary_countingboard = $('#primary_countingboard');

  if (main_interface.hasClass('fullscreen')) {
    main_interface.removeClass('fullscreen');
    main.removeClass('fullscreen');
    map.removeClass('fullscreen');
    detection_ui.removeClass('fullscreen');
    view_dividers.removeClass('fullscreen');
    viewer.removeClass('fullscreen');
    bottom_controls.removeClass('fullscreen');
    bottom_controls_keypad.removeClass('fullscreen');
    task_container.removeClass('fullscreen');
    zoom_view_toggles.removeClass('fullscreen');
    task_row_container.removeClass('fullscreen');
    practice_toggles.removeClass('fullscreen');
    submission_toggles.removeClass('fullscreen');
    practice_toggles_inner.removeClass('fullscreen');
    submission_toggles_inner.removeClass('fullscreen');
    practice_submission_toggles_inner.removeClass('fullscreen');
    practice_submission_toggles.removeClass('fullscreen');
    practice_validation_toggles.removeClass('fullscreen');
    primary_countingboard.removeClass('fullscreen');
    crowdcurio_nav_bar.show();
  } else {
    main_interface.addClass('fullscreen');
    main.addClass('fullscreen');
    map.addClass('fullscreen');
    detection_ui.addClass('fullscreen');
    view_dividers.addClass('fullscreen');
    viewer.addClass('fullscreen');
    bottom_controls.addClass('fullscreen');
    bottom_controls_keypad.addClass('fullscreen');
    task_container.addClass('fullscreen');
    zoom_view_toggles.addClass('fullscreen');
    task_row_container.addClass('fullscreen');
    practice_toggles.addClass('fullscreen');
    submission_toggles.addClass('fullscreen');
    practice_toggles_inner.addClass('fullscreen');
    submission_toggles_inner.addClass('fullscreen');
    practice_submission_toggles_inner.addClass('fullscreen');
    practice_submission_toggles.addClass('fullscreen');
    practice_validation_toggles.addClass('fullscreen');
    primary_countingboard.addClass('fullscreen');
    crowdcurio_nav_bar.hide();
  }

  // resize the map to reflect the visibility of what's visible in fullscreen
  ms.map.resize_map(true);
};

Object.size = function (obj) {
  let size = 0,
    key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

ImageAnnotator.prototype.togglePractice = function (e) {
  // open the loading modal
  this.modals.loading_modal.modal('open');

  // get references to the dom elements
  const btn = e.target;
  const practice_validation_window = $('#practice_validation_toggles');
  const practice_submission_window = $('#practice_submission_toggles');
  const submission_window = $('#submission_toggles');
  const Img = $('.subject');
  const oImg = new Image();
  const that = this;
  let state;

  // do nothing, if the button is disabled
  if ($(btn).hasClass('disabled')) {
    return;
  }

  $('#zoom').val('1.00');
  Img.removeAttr('style');

  // set-up a handler for loading a new image
  oImg.onload = function () {
    /*  compute the thumbnail size */
    let width = oImg.naturalWidth,
      height = oImg.naturalHeight,
      maxWidth = 180,
      maxHeight = 240;

    /*  check if width or height is larger and modify appropriately */
    if (width > maxWidth) {
      height = Math.floor(maxWidth * height / width);
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = Math.floor(maxHeight * width / height);
      height = maxHeight;
    }

    /*  set the thumbnail size / height / src */
    $('#thumb').attr({ width, height, src: oImg.src });

    /* show the map */
    $('#map').fadeIn();

    /* load the markers from the state onto the image */
    that.loadMarkers(that.states[state].markers);
    that.markers = that.states[state].markers;


    if (!('left' in that.states[state].map)) {
      that.states[state].map.top = $('#map').offset().top;
      that.states[state].map.left = $('#map').offset().left;
    }

    /* update the dom elements to reflect the state */
    if (state === 'practice') {
      $(btn).text('Stop Practicing');
      $(btn).addClass('active');

      // slide out / in the right windows
      submission_window.fadeOut(500, () => {
        // fade in the next practice task window
        practice_validation_window.fadeIn(500, () => {
          setTimeout(() => { that.map.map_move_to(15, 15); that.modals.loading_modal.modal('close'); }, 300);
        });
      });
    } else if (state === 'required') {
      $(btn).text('Start Practicing');
      $(btn).removeClass('active');

      // slide out / in the right windows
      practice_validation_window.fadeOut(500, () => {
        practice_submission_window.hide();
        // fade in the next required task window
        submission_window.fadeIn(500, () => {
          setTimeout(() => { that.map.map_move_to(15, 15); that.modals.loading_modal.modal('close'); }, 300);
        });
      });
    }

    // close the modal
    that.modals.fetching_task_modal.modal('close');
  };

  // determine state
  if ($(btn).text() === 'Start Practicing') { // if true, we're switching to practice
    state = 'practice';
    this.states.required.markers = this.markers;
    this.states.required.map = {
      x: parseInt($('.location').css('left').replace('px', '')), y: parseInt($('.location').css('top').replace('px', '')), left: $('#map').offset().left, top: $('#map').offset().top,
    };
    $('#zoom_in').hide();
    $('#zoom_out').hide();
  } else { // if we enter here, we're switching back to the required tasks
    state = 'required';
    this.states.practice.markers = this.markers;
    this.states.practice.map = {
      x: parseInt($('.location').css('left').replace('px', '')), y: parseInt($('.location').css('top').replace('px', '')), left: $('#map').offset().left, top: $('#map').offset().top,
    };
    $('#zoom_in').show();
    $('#zoom_out').show();
  }

  // save a new event model
  this.client.create('event', {
    content: {
      type: 'state-switch',
      destination: state,
    },
  }, () => {
    print('State-Switch Event: Saved!');
  });

  // delete the markers
  $('.marker').remove();
  $('.map-marker').remove();
  this.markers = {};

  // update the image
  const task = this.states[state].task;
  this.client.setData(task.id);
  that.data = task;
  oImg.src = task.url;
  Img.attr('src', task.url);
};

ImageAnnotator.prototype.loadState = function (state) {
  const that = this;
  for (const idx in state) {
    if (state[idx].hasOwnProperty('position')) {
      const marker = state[idx];
      const key = guidGenerator();
      var newMarker;
      if (marker.label === '') {
        newMarker = `<div annotation-id='${marker.id}' class='marker new unfinished' id='m-${key}' style='left: ${marker.position.x - 10}px;top:${marker.position.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
      } else {
        newMarker = `<div annotation-id='${marker.id}' class='marker new' id='m-${key}' style='left: ${marker.position.x - 10}px;top:${marker.position.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
      }
      $('#markers').append(newMarker);
      $(`#m-${key}`).draggable({
        start(e) {
          ms.dragTool(e); $('.delete-marker-btn').hide();
        },
        stop(e) {
          ms.dropTool(e); $('.delete-marker-btn').hide();
        },
      });
      $(`#m-${key}`).on('mouseenter', (e) => { ms.hoverToolOn(e); });
      $(`#m-${key}`).on('mouseleave', (e) => { ms.hoverToolOff(e); });
      surface.markers[key] = new Marker(marker.position.x, marker.position.y, marker.label);
    }
  }
};

ImageAnnotator.prototype.loadMarkers = function (markers) {
  // set local vars
  const marker_nums = {};
  const marker_sums = {};
  const that = this;

  // reset the count
  if (this.mode === 'counting') {
    $('.task-option-count').text('?');
  }

  // iterate over each marker
  for (var key in markers) {
    if (markers.hasOwnProperty(key)) {
      const marker = markers[key];

      /*  append the draggable element into html */
      var newMarker;
      if (that.mode === 'transcription') {
        if (marker.label === '') {
          newMarker = `<div class='marker new unfinished' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        } else {
          newMarker = `<div class='marker new' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        }
      } else if (that.mode === 'counting') {
        // 1. get the marker's class
        var marker_num;
        if (!(marker_num in marker_nums)) {
          marker_num = $(`#${marker.label}-btn`).attr('lval');
          marker_nums[marker.label] = marker_num;
        } else { // no need to reparse the dom
          marker_num = marker_num[marker.label];
        }

        if (!(marker.label in marker_sums)) {
          marker_sums[marker.label] = 0;
        }

        marker_sums[marker.label] += 1;

        // 2. create the marker tempalte
        newMarker = `<div class='marker ${marker_num} new' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
      }

      $('#markers').append(newMarker);
      $(`#m-${key}`).draggable({
        start(e) {
          ms.dragTool(e); $('.delete-marker-btn').hide();
        },
        stop(e) {
          ms.dropTool(e); $('.delete-marker-btn').hide();
        },
      });
      $(`#m-${key}`).on('mouseenter', (e) => { ms.hoverToolOn(e); });
      $(`#m-${key}`).on('mouseleave', (e) => { ms.hoverToolOff(e); });
    }
  }

  // add the counts to the labels if we're counting
  if (this.mode === 'counting') {
    for (key in marker_sums) {
      $(`#${key}-count`).text(marker_sums[key]);
    }
  }
};


ImageAnnotator.prototype.loadKnownMarkers = function (name) {
  /**
       * Helper function for calculating Euclidean distance.
       * @param point
       * @param target
       * @returns {Number}
    */
  function d(point, target) {
    return parseInt(Math.sqrt(Math.pow(Math.abs(point.x - target.x), 2) + Math.pow(Math.abs(point.y - target.y), 2)));
  }

  // get the data from the known annotations object
  const that = this;
  const markers = this.known_annotations[name];
  const marker_nums = {};
  const marker_sums = {};
  const local_markers = JSON.parse(JSON.stringify(ms.markers));
  const known_annotations = Object.keys(markers).length;
  let false_negative_annotations = 0;
  let false_positive_annotations = 0;
  let true_positive_annotations = 0;

  // verify we have a valid marker set.
  if (!markers) {
    print(`Known annotations don't exist for "${name}"`);
    return;
  }

  // iterate over each marker
  for (var key in markers) {
    if (markers.hasOwnProperty(key)) {
      var marker = markers[key];

      /*  append the draggable element into html */
      var newMarker;
      if (that.mode === 'transcription') {
        if (marker.label === '') {
          newMarker = `<div class='marker new unfinished' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        } else {
          newMarker = `<div class='marker new' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        }
      } else if (that.mode === 'counting') {
        // 1. get the marker's class
        var marker_num;
        if (!(marker_num in marker_nums)) {
          marker_num = $(`#${marker.label}-btn`).attr('lval');
          marker_nums[marker.label] = marker_num;
        } else { // no need to reparse the dom
          marker_num = marker_num[marker.label];
        }

        if (!(marker.label in marker_sums)) {
          marker_sums[marker.label] = 0;
        }

        marker_sums[marker.label] += 1;

        // 2. create the marker tempalte

        // 2.1. try to find the user's closet annotation
        const target = { x: marker.x, y: marker.y };
        let cur_min = null;
        var cur_point = null;
        for (m in ms.markers) {
          const dval = d(ms.markers[m], target);
          if (dval < cur_min || cur_min == null) {
            cur_min = dval;
            cur_point = m;
          }
        }

        const orange_background = 'background: -webkit-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;background: -moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;background: radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;';
        const green_background = 'background: -webkit-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;background: -moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;background: radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;';

        if (cur_min > 30 || cur_min === null) {
          function guidGenerator() {
            const S4 = function () {
              return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
            };
            return (`${S4() + S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}`);
          }


          false_negative_annotations += 1;
          cur_point = guidGenerator();
          newMarker = `<div class='marker known-annotation ${marker_num} new' id='m-${cur_point}-correct' style='border-radius: 100px; background: -webkit-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;background: -moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;background: radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, orange 10%) !important;width: 60px; height: 60px;left: ${marker.x - 30}px;top:${marker.y - 30}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        } else {
          delete local_markers[cur_point];
          true_positive_annotations += 1;
          newMarker = `<div class='marker known-annotation ${marker_num} new' id='m-${cur_point}-correct' style='border-radius: 100px; background: -webkit-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;background: -moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;background: radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, green 10%) !important;width: 60px; height: 60px;left: ${marker.x - 30}px;top:${marker.y - 30}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        }
      }

      $('#markers').append(newMarker);
      $(`#m-${cur_point}-correct`).on('mouseenter', (e) => {
        $(e.target).animate({ opacity: '0' }, 150);
        $(`#m-${e.target.id.split('-')[1]}`).animate({ opacity: '0' }, 150);
      });
      $(`#m-${cur_point}-correct`).on('mouseleave', (e) => {
        $(e.target).animate({ opacity: '100' }, 150);
        $(`#m-${e.target.id.split('-')[1]}`).animate({ opacity: '100' }, 150);
      });
    }
  }

  // before wrapping up, do a final pass for any false positives that someone may've highlighted

  for (key in local_markers) {
    var marker = local_markers[key];
    var newMarker;

    if (ms.mode === 'counting') {
      newMarker = `<div class='marker known-annotation ${marker_num} new' id='m-${key}-incorrect' style='border-radius: 100px; background: -webkit-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, red 10%) !important;background: -moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, red 10%) !important;background: radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.0) 60%, red 10%) !important;width: 60px; height: 60px;left: ${marker.x - 30}px;top:${marker.y - 30}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'></div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
    }

    $(`#m-${key}`).css('background', '-moz-radial-gradient(50% 50%, circle, rgba(0, 255, 0, 0.25) 60%, #801700 10%)');
    $(`#m-${key}`).css('background-color', '#f009');

    $('#markers').append(newMarker);
    $(`#m-${key}-incorrect`).on('mouseenter', (e) => {
      $(e.target).animate({ opacity: '0' }, 150);
      $(`#m-${e.target.id.split('-')[1]}`).animate({ opacity: '0' }, 150);
    });
    $(`#m-${key}-incorrect`).on('mouseleave', (e) => {
      $(e.target).animate({ opacity: '100' }, 150);
      $(`#m-${e.target.id.split('-')[1]}`).animate({ opacity: '1000' }, 150);
    });
    false_positive_annotations += 1;
  }

  // save a new event model
  this.client.create('event', {
    content: {
      type: 'practice-performance',
      fp: false_positive_annotations,
      tp: true_positive_annotations,
      fn: false_negative_annotations,
    },
  }, () => {
    print('Pracitice Performance Event: Saved!');
  });
};


ImageAnnotator.prototype.calculateAccuracy = function (name) {
  /**
       * Helper function for calculating Euclidean distance.
       * @param point
       * @param target
       * @returns {Number}
    */
  function d(point, target) {
    return parseInt(Math.sqrt(Math.pow(Math.abs(point.x - target.x), 2) + Math.pow(Math.abs(point.y - target.y), 2)));
  }

  // get the data from the known annotations object
  const that = this;
  const markers = this.known_annotations[name];
  const marker_nums = {};
  const marker_sums = {};
  const local_markers = JSON.parse(JSON.stringify(ms.markers));
  const known_annotations = Object.keys(markers).length;
  let false_negative_annotations = 0;
  let false_positive_annotations = 0;
  let true_positive_annotations = 0;

  // verify we have a valid marker set.
  if (!markers) {
    print(`Known annotations don't exist for "${name}"`);
    return;
  }

  // iterate over each marker
  for (var key in markers) {
    if (markers.hasOwnProperty(key)) {
      var marker = markers[key];

      /*  append the draggable element into html */
      var newMarker;
      if (that.mode === 'transcription') {
        if (marker.label === '') {
          newMarker = `<div class='marker new unfinished' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        } else {
          newMarker = `<div class='marker new' id='m-${key}' style='left: ${marker.x - 10}px;top:${marker.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
        }
      } else if (that.mode === 'counting') {
        // 1. get the marker's class
        var marker_num;
        if (!(marker_num in marker_nums)) {
          marker_num = $(`#${marker.label}-btn`).attr('lval');
          marker_nums[marker.label] = marker_num;
        } else { // no need to reparse the dom
          marker_num = marker_num[marker.label];
        }

        if (!(marker.label in marker_sums)) {
          marker_sums[marker.label] = 0;
        }

        marker_sums[marker.label] += 1;

        // 2. create the marker tempalte

        // 2.1. try to find the user's closet annotation
        const target = { x: marker.x, y: marker.y };
        let cur_min = null;
        let cur_point = null;
        for (m in ms.markers) {
          const dval = d(ms.markers[m], target);
          if (dval < cur_min || cur_min == null) {
            cur_min = dval;
            cur_point = m;
          }
        }

        if (cur_min > 30 || cur_min === null) {
          function guidGenerator() {
            const S4 = function () {
              return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
            };
            return (`${S4() + S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}`);
          }

          false_negative_annotations += 1;
        } else {
          delete local_markers[cur_point];
          true_positive_annotations += 1;
        }
      }
    }
  }

  // before wrapping up, do a final pass for any false positives that someone may've highlighted

  for (key in local_markers) {
    var marker = local_markers[key];
    var newMarker;
    false_positive_annotations += 1;
  }

  // save a new event model
  this.client.create('event', {
    content: {
      type: 'required-performance',
      fp: false_positive_annotations,
      tp: true_positive_annotations,
      fn: false_negative_annotations,
    },
  }, () => {
    print('Required Performance Event: Saved!');
  });
};


/* Curio-Specific Things */
ImageAnnotator.prototype.countMarkers = function () {
  return Object.size(surface.markers);
};

/**
 * Handles SAVE events made on annotations.
 * @param {*} event : broadcasted event from the Collaboration app.
 */
ImageAnnotator.prototype.handleInterfaceUpdateSave = function (event) {
  const marker = event.payload.annotation;
  const annotation_element = $(`div[annotation-id="${marker.id}"]`);

  // if *this* user is the person who made the save event trigger, ignore it.
  if (parseInt(marker.updated_by) === parseInt(window.user)) {
    return;
  }

  // Does the annotation exist already?
  if (annotation_element.length) { // Case 1: The annotation exists, so update it.
    annotation_element.css('left', `${marker.position.x - 10}px`);
    annotation_element.css('top', `${marker.position.y - 10}px`);

    if (marker.label !== '') {
      annotation_element.removeClass('unfinished');
      $(`div[annotation-id="${marker.id}"] > .character`).html(marker.label);
    }

    var key = annotation_element.attr('id').split('-')[1];
    surface.markers[key] = new Marker(marker.position.x, marker.position.y, marker.label);
  } else { // Case 2: The annotation doesn't exist on the screen, so we need to create it.
    var key = guidGenerator();
    let newMarker;
    if (marker.label === '') {
      newMarker = `<div annotation-id='${marker.id}' class='marker new unfinished' id='m-${key}' style='left: ${marker.position.x - 10}px;top:${marker.position.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
    } else {
      newMarker = `<div annotation-id='${marker.id}' class='marker new' id='m-${key}' style='left: ${marker.position.x - 10}px;top:${marker.position.y - 10}px;background:${$('#m_colour').val()};opacity:${$('#m_opacity').val()}'><div class='character'>${marker.label}</div><div id='delete-marker-${key}' class='delete-marker-btn' style='display:none;'>Delete</div></div>`;
    }
    $('#markers').append(newMarker);
    $(`#m-${key}`).draggable({
      start(e) {
        ms.dragTool(e); $('.delete-marker-btn').hide();
      },
      stop(e) {
        ms.dropTool(e); $('.delete-marker-btn').hide();
      },
    });
    $(`#m-${key}`).on('mouseenter', (e) => { ms.hoverToolOn(e); });
    $(`#m-${key}`).on('mouseleave', (e) => { ms.hoverToolOff(e); });
    surface.markers[key] = new Marker(marker.position.x, marker.position.y, marker.label);
  }

  // Show the update on the mini map
  const map_marker_id = `map-marker-${guidGenerator()}`;
  const thumb_element = $('#thumb');
  const map_coordinate_x = (marker.position.x / global.oImg.naturalWidth) * thumb_element.width();
  const map_coordinate_y = (marker.position.y / global.oImg.naturalHeight) * thumb_element.height();
  const map_marker = `<div id=${map_marker_id} class="map-marker" style="left:${map_coordinate_x + 3}px;top:${map_coordinate_y + 3}px;"></div>`;
  $('#map').append(map_marker);
  const marker_element = $(`#${map_marker_id}`);
  marker_element.animate({ opacity: 0.5 }, 8000, () => {
    // marker_element.remove();
  }); // fade the marker out after 8 seconds and then remove it.


  // add a toast
  Materialize.toast('Tate created an annotation.', 3000, 'rounded');
};

/**
 * Handles DELETE events made on annotations.
 * @param {*Object} event : broadcasted event from the Collaboration app.
 */
ImageAnnotator.prototype.handleInterfaceUpdateDelete = function (event) {
  const annotation_id = event.payload.annotation.id;
  $(`div[annotation-id="${annotation_id}"`).remove();
};


module.exports = ImageAnnotator;
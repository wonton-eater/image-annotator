/*      file:       papyri-mini-map.js
        author:     alex c. williams
        description:
        the implementation of the papyri mini map class.
 */
const $ = require('jquery');
const jQuery = require('jquery');
const jq = require('jquery');
require('jquery-ui-browserify');

function ImageMiniMap() {
  thisMap = this;

  this.mapInitialized = false;
}

ImageMiniMap.prototype.initMap = function () {
  /*  default settings for the mini map */
  $('#thumb').on('load', () => {
    surface.map.resize_map();
    surface.map.updateMapLocation();
    surface.map.mapInitialized = true;
  });

  /*  draggability for the mini map overlay */
  $('#map .location').draggable({
    drag(event, ui) {
      surface.map.updateFragmentPosition();
    },
  });

  $('#map').click((e) => {
    thisMap.onClickImageReposition(e);
  });
};

ImageMiniMap.prototype.onClickImageReposition = function (event) {
  const mx = event.pageX - $('#map').offset().left;
  const my = event.pageY - $('#map').offset().top;
  this.map_move_to(mx, my);
  event.preventDefault();
};

ImageMiniMap.prototype.updateFragmentPosition = function () {
  const factor = $('#fragment img:visible').last().width() / $('#map img').width();
  const left = (0 - $('#map .location').position().left+6.3) * factor;//jarvis
  const top = (0 - $('#map .location').position().top+6.3) * factor;//jarvis
  $('#fragment_container').css('top', top);
  $('#fragment_container').css('left', left);
};

ImageMiniMap.prototype.resize_map = function (animate, factor) {
  console.log("resized");
  
  const main_interface = $('#main-interface');
  if (main_interface.hasClass('fullscreen')) {//checks whether fullscreen mode is currently on
    var w = screen.width; 
    var h = screen.height;
    var DPR = window.devicePixelRatio;
    w = Math.round(DPR * w); 
    h = Math.round(DPR * h);
    console.log("it is wrong");
    console.log(screen.width);
    console.log(screen.height);
    console.log(w);
    console.log(h);
    factor = $('#map #thumb').width() / $('.subject').width();
    const location_width = screen.width * factor;
    let location_height = screen.height * factor;
    console.log("location_width: "+location_width);
    console.log("location_height "+location_height);
    if (animate) {
        $('#map .location').animate({
          width: location_width,
          height: location_height,
        }, 100, () => {});
      } else {
        console.log("width: "+location_width);
        console.log("height: "+location_height);
        const map = $('#map .location');
        map.css('width', location_width);
        map.css('height', location_height);
        map.css('border', '0px solid black');//jarvis
      }
  }else{
    factor = isNaN(factor) ? $('#map #thumb').width() / $('.subject').width() : factor;
    if (!isNaN(factor)) {
      const location_width = $('#viewer').width() * factor;
      let location_height = $('#viewer').height() * factor;

      // if ($('#main-interface').hasClass('fullscreen')) {
      //   location_height -= (241 * factor);
      // }

      if (animate) {
        $('#map .location').animate({
          width: location_width,
          height: location_height,
        }, 100, () => {});
      } else {
        const map = $('#map .location');
        map.css('width', location_width);
        map.css('height', location_height);
        map.css('border', '0px solid black');//jarvis
      }
    }
  }

};

ImageMiniMap.prototype.updateMapLocation = function (factor) {
  factor = isNaN(factor) ? $('#map #thumb').width() / $('#fragment img:visible').last().width() : factor;
  console.log("factor: "+factor);
  const left = (0 - $('#fragment_container').position().left) * factor + 6.3;//jarvis 
  const top = (0 - $('#fragment_container').position().top) * factor + 6.3;//jarvis
  const map = $('#map .location');
  if (top < 1 && left < 1) {
    map.css('top', '5px');
    map.css('left', '5px');
  } else {
    map.css('top', top);
    map.css('left', left);
  }
};

ImageMiniMap.prototype.map_move_to = function (mx, my) {
  const factor = $('#fragment img:visible').last().width() / $('#map #thumb').width();
  const x = mx * factor;
  const y = my * factor;
  this.repositionFragment(x, y);
};

ImageMiniMap.prototype.repositionFragment = function (x, y) {
  let v_top = 0 - $('#fragment_container').position().top;
  let v_bottom = v_top + $('#viewer').height();
  let v_left = 0 - $('#fragment_container').position().left;
  let v_right = v_left + $('#viewer').width();

  let v_trans = '+=0';
  let h_trans = '+=0';
  let distance = 0;
  const padding = 100;

  v_right -= padding;
  v_left += padding;
  v_top += padding;
  v_bottom -= padding;

  if (y < v_top) {
    distance = v_top - y;
    v_trans = `+=${  distance}`;
  }

  if (y > v_bottom) {
    distance = y - v_bottom;
    v_trans = `-=${  distance}`;
  }

  if (x < v_left) {
    distance = v_left - x;
    h_trans = `+=${  distance}`;
  }

  if (x > v_right) {
    distance = x - v_right;
    h_trans = `-=${  distance}`;
  }

  if ((typeof (h_trans) === 'string') || (typeof (v_trans) === 'string')) {
    $('#fragment_container').stop().animate({
      top: v_trans,
      left: h_trans,
    }, 500);

    this.repositionMap(h_trans, v_trans);
  }
};

ImageMiniMap.prototype.repositionMap = function (left_trans, top_trans) {
  const factor = $('#map #thumb').width() / $('#fragment img:visible').last().width();

  let scaled_left = left_trans;
  let scaled_top = top_trans;
  let sign = '';

  if (left_trans.split) {
    if (left_trans.split('=')[0] == '+') {
      sign = '-';
    }
    if (left_trans.split('=')[0] == '-') {
      sign = '+';
    }
    scaled_left = `${sign}=${(left_trans.split('=')[1]) * factor}`;
  } else {
    scaled_left = -(left_trans * factor);
  }

  if (top_trans.split) {
    if (top_trans.split('=')[0] == '+') {
      sign = '-';
    }
    if (top_trans.split('=')[0] == '-') {
      sign = '+';
    }
    scaled_top = `${sign}=${(top_trans.split('=')[1]) * factor}`;
  } else {
    scaled_top = -(top_trans * factor);
  }

  $('#map .location').stop().animate({
    top: scaled_top,
    left: scaled_left,
  }, 350);
};

ImageMiniMap.prototype.toggleMapVisibility = function (event) {
  if ($('#map').css('display') == 'none') {
    $('.modal').hide();
    $('.colours').fadeOut(() => { $('#map').fadeIn() ;});
    $('#map').css('display', 'block');
    surface.map.resize_map(true);
    surface.map.updateMapLocation();
  } else {
    $('#map').css('display', 'none');
    $('#map').fadeOut();
  }
  //surface.update_toggles();
  event.preventDefault();
};

ImageMiniMap.prototype.fadeMapOut = function (fadeVal) {
  fadeVal = (typeof fadeVal === 'undefined') ? 0 : fadeVal;

  $('#map').fadeOut(fadeVal, () => {
    // $("#map img").remove();
  });
};

ImageMiniMap.prototype.fadeMapIn = function (thumb_width, fragment_width, force) {
  /*  force is a bypass-variable that tells us if we just need to fadein the map */
  force = (typeof force === 'undefined') ? 0 : force;

  if (!force) {
    const factor = thumb_width / fragment_width;
    this.updateMapLocation(factor);
    this.resize_map(false, factor);

    /* wait for the image to load */
    $('#thumb').one('load', () => {
      $('#map').fadeIn(500);
    });
  } else {
    $('#map').fadeIn(500);
  }
};

ImageMiniMap.prototype.map_check = function (thumb_img, fragment_img) {
  const t_size = thumb_img;
  const f_size = fragment_img;
  if (t_size.width > 0 && f_size.width > 0 && !surface.map.map_initalized) {
    const factor = t_size.width / f_size.width;
    surface.map.updateMapLocation(factor);
    surface.map.resize_map(false, factor);
    $('#map .location').fadeIn(500);
    surface.map.map_initalized = true;
  }
};

module.exports = ImageMiniMap;

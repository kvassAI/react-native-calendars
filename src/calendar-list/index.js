import React, {Component} from 'react';
import {
  FlatList, Platform, Dimensions,
} from 'react-native';
import PropTypes from 'prop-types';
import XDate from 'xdate';

import {xdateToData, parseDate} from '../interface';
import styleConstructor from './style';
import dateutils from '../dateutils';
import Calendar from '../calendar';
import CalendarListItem from './item';

const calendarHeight = 360;

const {width} = Dimensions.get('window');

// TODO Two issues are considered here:
// 1: Some devices have weird width outputed by RN, such as Nexus x5 => width: 411.42857142857144
// The assumption is that this causes wrong calculations on scrollOffsett and initialScroll positions, which breaks with onViewableItemsChanged
// 2: `initialScrollIndex` appears to not work properly. It causes for the previous month to not be rendered.
// This could be as well related to the wrong calculations. See 1.
// Some github issues to be followed that might fix the issue:
// => https://github.com/facebook/react-native/issues/18743
// => https://github.com/facebook/react-native/issues/18104
// As solution, we set viewabilityConfig to fix issue 1. For #2 we set the month -1 on view load and then manually force it to go to the correct index. This apparatently renders it correctly.

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
}

class CalendarList extends Component {
  static propTypes = {
    ...Calendar.propTypes,

    // Max amount of months allowed to scroll to the past. Default = 50
    pastScrollRange: PropTypes.number,

    // Max amount of months allowed to scroll to the future. Default = 50
    futureScrollRange: PropTypes.number,

    // Enable or disable scrolling of calendar list
    scrollEnabled: PropTypes.bool,

    // Enable or disable vertical scroll indicator. Default = false
    showScrollIndicator: PropTypes.bool,

    // When true, the calendar list scrolls to top when the status bar is tapped. Default = true
    scrollsToTop: PropTypes.bool,

    // Enable or disable paging on scroll
    pagingEnabled: PropTypes.bool,

    // Used when calendar scroll is horizontal, default is device width, pagination should be disabled
    calendarWidth: PropTypes.number,

    // Dynamic calendar height, mainly used in horizontal scroll
    calendarHeight: PropTypes.number,

    // Whether the scroll is horizontal
    horizontal: PropTypes.bool,
  };

  constructor(props) {
    super(props);
    this.pastScrollRange = props.pastScrollRange === undefined ? 50 : props.pastScrollRange;
    this.futureScrollRange = props.futureScrollRange === undefined ? 50 : props.futureScrollRange;
    this.style = styleConstructor(props.theme);

    this.calendarHeight = props.calendarHeight || calendarHeight;
    this.calendarWidth = props.calendarWidth || width;

    this.rows = [];
    this.hasScrolled = false;

    const texts = [];
    const date = parseDate(props.current) || XDate();
    for (let i = 0; i <= this.pastScrollRange + this.futureScrollRange; i++) {
      const rangeDate = date.clone().addMonths(i - this.pastScrollRange, true);
      const rangeDateStr = rangeDate.toString('MMM yyyy');
      texts.push(rangeDateStr);
      /*
       * This selects range around current shown month [-0, +2] or [-1, +1] month for detail calendar rendering.
       * If `this.pastScrollRange` is `undefined` it's equal to `false` or 0 in next condition.
       */
      if (this.pastScrollRange - 1 <= i && i <= this.pastScrollRange + 1 || !this.pastScrollRange && i <= this.pastScrollRange + 2) {
        this.rows.push(rangeDate);
      } else {
        this.rows.push(rangeDateStr);
      }
    }

    this.state = {
      rows: [...this.rows],
      texts,
      openDate: date,
      initialized: false
    };

    this.getItemLayout = this.getItemLayout.bind(this);
    this.onViewableItemsChangedBound = this.onViewableItemsChanged.bind(this);
    this.renderCalendarBound = this.renderCalendar.bind(this);
    this.getItemLayout = this.getItemLayout.bind(this);
  }

  scrollToDay(d, offset, animated) {
    const day = parseDate(d);
    const diffMonths = Math.round(this.state.openDate.clone().setDate(1).diffMonths(day.clone().setDate(1)));
    let scrollAmount = (this.calendarHeight * this.pastScrollRange) + (diffMonths * this.calendarHeight) + (offset || 0);
    let week = 0;
    const days = dateutils.page(day, this.props.firstDay);
    for (let i = 0; i < days.length; i++) {
      week = Math.floor(i / 7);
      if (dateutils.sameDate(days[i], day)) {
        scrollAmount += 46 * week;
        break;
      }
    }
    this.listView.scrollToOffset({offset: scrollAmount, animated});
  }

  scrollToMonth(m) {
    const month = parseDate(m);
    const scrollTo = month || this.state.openDate;
    let diffMonths = Math.round(this.state.openDate.clone().setDate(1).diffMonths(scrollTo.clone().setDate(1)));
    const scrollAmount = (this.calendarHeight * this.pastScrollRange) + (diffMonths * this.calendarHeight);
    //console.log(month, this.state.openDate);
    //console.log(scrollAmount, diffMonths);
    this.listView.scrollToOffset({offset: scrollAmount, animated: false});
  }

  componentWillReceiveProps(props) {
    const current = parseDate(this.props.current);
    const nextCurrent = parseDate(props.current);
    if (nextCurrent && current && nextCurrent.getTime() !== current.getTime()) {
      this.scrollToMonth(nextCurrent);
    }

    const rowclone = [...this.rows];
    const newrows = [];
    const texts = [...this.state.texts];

    for (let i = 0; i < rowclone.length; i++) {
      let val = texts[i];
      if (rowclone[i].getTime) {
        val = rowclone[i].clone();
        val.propbump = rowclone[i].propbump ? rowclone[i].propbump + 1 : 1;
      }
      newrows.push(val);
    }

    this.rows = [ ...newrows ];
    this.setState({
      rows: this.rows,
    });
  }

  onViewableItemsChanged({viewableItems}) {
    if (viewableItems.length > 0) {
      function rowIsCloseToViewable(index, distance) {
        for (let i = 0; i < viewableItems.length; i++) {
          if (Math.abs(index - parseInt(viewableItems[i].index)) <= distance) {
            return true;
          }
        }
        return false;
      }

      // Hack to force next month, fix issue with missing previous month on loading,
      if (!this.hasScrolled) {
        this.listView.scrollToIndex({animated: false, index: this.getMonthIndex(this.state.openDate)});
      }

      const rowclone = [ ...this.rows];
      const texts = [...this.state.texts];
      const newrows = [];
      const visibleMonths = [];
      for (let i = 0; i < rowclone.length; i++) {
        let val = rowclone[i];
        const rowShouldBeRendered = rowIsCloseToViewable(i, 1);
        if (rowShouldBeRendered && !rowclone[i].getTime) {
          val = this.state.openDate.clone().addMonths(i - this.pastScrollRange, true);
        } else if (!rowShouldBeRendered) {
          val = texts[i];
        }
        newrows.push(val);
        if (rowIsCloseToViewable(i, 0)) {
          if (this.hasScrolled) {
            visibleMonths.push(xdateToData(val));
          }
        }
      }

      if (this.props.onVisibleMonthsChange) {
        this.props.onVisibleMonthsChange(visibleMonths);
      }

      this.rows = [ ...newrows ];
      this.hasScrolled = true;

      this.setState({
        rows: this.rows,
      });
    }
  }

  renderCalendar({item}) {
    return (<CalendarListItem item={item} calendarHeight={this.calendarHeight} calendarWidth={this.props.horizontal && this.props.pagingEnabled ? this.calendarWidth : undefined  } {...this.props} />);
  }

  getItemLayout(data, index) {
    return {length: this.props.horizontal ? this.calendarWidth : calendarHeight, offset: (this.props.horizontal ? this.calendarWidth : calendarHeight) * index, index};
  }

  getMonthIndex(month) {
    let diffMonths = this.state.openDate.diffMonths(month) + this.pastScrollRange;
    return diffMonths;
  }

  render() {
    return (
      <FlatList
        ref={(c) => this.listView = c}
        //scrollEventThrottle={1000}
        style={[this.style.container, this.props.style]}
        // initialListSize={this.pastScrollRange * this.futureScrollRange + 1}
        data={this.state.rows}
        //snapToAlignment='start'
        //snapToInterval={this.calendarHeight}
        removeClippedSubviews={Platform.OS === 'android' ? false : true}
        // pageSize={1}
        horizontal={this.props.horizontal || false}
        pagingEnabled={this.props.pagingEnabled && !this.props.calendarWidth || false}
        onViewableItemsChanged={this.onViewableItemsChangedBound}
        renderItem={this.renderCalendarBound}
        showsVerticalScrollIndicator={this.props.showScrollIndicator !== undefined ? this.props.showScrollIndicator : false}
        showsHorizontalScrollIndicator={this.props.showScrollIndicator !== undefined ? this.props.showScrollIndicator : false}
        scrollEnabled={this.props.scrollingEnabled !== undefined ? this.props.scrollingEnabled : true}
        keyExtractor={(item, index) => String(index)}
        initialScrollIndex={this.state.openDate ? this.getMonthIndex(this.state.openDate) - 1 : false}
        getItemLayout={this.getItemLayout}
        viewabilityConfig={viewabilityConfig}
        scrollsToTop={this.props.scrollsToTop !== undefined ? this.props.scrollsToTop : false}
      />
    );
  }
}

export default CalendarList;

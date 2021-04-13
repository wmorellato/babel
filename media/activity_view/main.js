//@ts-check

(function () {
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
      case 'activityHistory':
        updateActivityChart(message.data);
        break;
    }
  });

  function updateActivityChart(activityData) {
    const calendarDivId = 'calendar';
    const overviewPeriod = 'year';
    const color = '#2350cc';

    if (calendarHeatmap && activityData) {
      calendarHeatmap.init(activityData, calendarDivId, color, overviewPeriod);
    }
  }
}());
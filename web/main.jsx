import "whatwg-fetch";
import React from 'react';
import ReactDOM from 'react-dom';
import uri from 'urijs';
import d3 from 'd3';
import {LchColor, lchToRgb, formatRgbToHex} from 'inkdrop';

function stdev(items) {
  const m = d3.mean(items);

  const variance = d3.mean(items.map((i) => {
    const diff = i - m;
    return diff * diff;
  }));

  return Math.sqrt(variance);
}

function Report(name, version, samples) {
  this.name = name;
  this.version = version;
  this.samples = samples;
}

class Results {
  constructor() {
    this.reports = [];
    this.sampleNames = [];
    this.sampleNamesIndex = {};
  }

  update(name, version, samples) {
    this.reports.push(new Report(name, version, samples));

    const keys = Object.keys(samples);
    for (let i = 0; i < keys.length; i++) {
      const sampleName = keys[i];
      const v = this.sampleNamesIndex[sampleName];
      if (v === undefined) {
        this.sampleNamesIndex[sampleName] = this.sampleNames.length;
        this.sampleNames.push(sampleName);
      }
    }
  }
}

class Header extends React.Component {
  shouldComponentUpdate(nextProps, nextState) {
    return false;
  }

  render() {
    return (
      <div className="jumbotron">
        <div className="container">
          <h1>UI Benchmark</h1>
          <p>To start benchmarking, click on the "Open" button below library name that you want to test, it will
            open a new window, perform tests and send results back to the main window, results will be displayed
            at the bottom section "Results".</p>
          <p>This benchmark measures how long it takes to perform update from one state to another, it doesn't
            measure how long will take paint/layout/composition phases, just js part.</p>
          <p>In the "Results" section there will be different test cases, for example test
            case <code>table/[100,4]/render</code> represents update from empty table to table with 100 rows and 4
            columns. Test case <code>table/[100,4]/filter/32</code> is an update from table with 100 rows and 4
            columns to the same table where each 32th item is removed. Details about all test cases can be found inside
            the <a href="https://github.com/localvoid/uibench-base/blob/master/lib/uibench.ts#L317">uibench.js</a> file.</p>
          <p className="lead">
            <a className="github-button" href="https://github.com/localvoid/uibench" data-style="mega" data-count-href="/localvoid/uibench/stargazers" data-count-api="/repos/localvoid/uibench#stargazers_count" data-count-aria-label="# stargazers on GitHub" aria-label="Star localvoid/uibench on GitHub">Star</a>
          </p>
        </div>
      </div>
    );
  }
}

function _createQuery(opts) {
  const q = {
    report: true,
    i: opts.iterations,
  };
  if (opts.disableSCU) {
    q.disableSCU = true;
  }
  if (opts.enableDOMRecycling) {
    q.enableDOMRecycling = true;
  }
  if (opts.mobileMode) {
    q.mobile = true;
  }
  if (opts.testFilter) {
    q.filter = opts.testFilter;
  }

  return q;
}

class Contestant extends React.Component {
  constructor(props) {
    super(props);
    this.openWindow = this.openWindow.bind(this);
  }

  openWindow(e) {
    window.open(uri(this.props.benchmarkUrl).addQuery(_createQuery(this.props.opts)), '_blank');
  }

  render() {
    const size = this.props.size === 0 ? null : <small>{this.props.size} bytes</small>;
    return (
      <div className="list-group-item">
        <h4 className="list-group-item-heading"><a href={this.props.url} target="_blank">{this.props.name}</a> {size}</h4>
        <p><small>{this.props.comments}</small></p>
        <div className="btn-group btn-group-xs">
          <button className="btn btn-default" onClick={this.openWindow}>Open</button>
        </div>
      </div>
    );
  }
}

class CustomContestant extends React.Component {
  constructor(props) {
    super(props);
    let url = localStorage['customURL'];
    if (url === void 0) {
      url = '';
    }
    this.state = {url: url};

    this.changeUrl = this.changeUrl.bind(this);
    this.openWindow = this.openWindow.bind(this);
  }

  changeUrl(e) {
    const v = e.target.value;
    localStorage['customURL'] = v;
    this.setState({url: v});
  }

  openWindow(e) {
    window.open(uri(this.state.url).addQuery(_createQuery(this.props.opts)), '_blank');
  }

  render() {
    return (
      <div key="custom_url" className="list-group-item">
        <h4 className="list-group-item-heading">Custom URL</h4>
        <div className="input-group">
          <input type="text" className="form-control" placeholder="http://www.example.com" value={this.state.url} onChange={this.changeUrl} />
          <span className="input-group-btn">
            <button className="btn btn-default" onClick={this.openWindow}>Open</button>
          </span>
        </div>
      </div>
    );
  }
}

class Contestants extends React.Component {
  render() {
    const props = this.props;
    return (
      <div className="list-group">
        {props.contestants.map((c) => <Contestant key={`${c.name}_${c.version}`} {...c} opts={props.opts} />)}
        <CustomContestant opts={props.opts} />
      </div>
    )
  }
}

class ResultsTable extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      filter: ''
    }
  }

  handleFilterChange(e) {
    this.setState({filter: e.target.value});
  }

  render() {
    const filter = this.state.filter || '';
    const results = this.props.results;
    const sampleNames = results.sampleNames;
    const reports = results.reports;

    if (reports.length === 0) {
      return (
        <div className="panel panel-default">
          <div className="panel-heading">Results (lower is better) </div>
          <div className="panel-body">Empty</div>
        </div>
      );
    }

    const titles = reports.map((r) => <th>{r.name} <small>{r.version}</small></th>);

    const rows = [];
    const overallTime = reports.map((r) => 0);

    for (let i = 0; i < sampleNames.length; i++) {
      const sampleName = sampleNames[i];
      if (sampleName.indexOf(filter) === -1) {
        continue;
      }

      const cols = [<td><code>{sampleName}</code></td>];

      const values = reports.map((r) => {
        const samples = r.samples[sampleName];

        return {
          sampleCount: samples.length,
          median: d3.median(samples),
          mean: d3.mean(samples),
          stdev: stdev(samples),
          min: d3.min(samples),
          max: d3.max(samples),
        };
      });

      const medianValues = values.map((v) => v.median);
      const medianMin = d3.min(medianValues);

      const scale = d3.scale.linear().domain([medianMin, d3.max(medianValues)]);

      for (let j = 0; j < reports.length; j++) {
        const report = reports[j];
        const value = values[j];
        const color = lchToRgb(new LchColor(0.9, 0.4, (30 + 110 * (1 - scale(value.median))) / 360));
        const style = {
          background: formatRgbToHex(color)
        };

        const title = `samples: ${value.sampleCount.toString()}\n` +
                      `median: ${Math.round(value.median * 1000).toString()}\n` +
                      `mean: ${Math.round(value.mean * 1000).toString()}\n` +
                      `stdev: ${Math.round(value.stdev * 1000).toString()}\n` +
                      `min: ${Math.round(value.min * 1000).toString()}\n` +
                      `max: ${Math.round(value.max * 1000).toString()}`;

        const percent = medianMin === value.median ?
          null :
          <small>{`(${(((value.median / medianMin) - 1) * 100).toFixed(2)}%)`}</small>;

        cols.push(<td title={title} style={style}>{Math.round(value.median * 1000) } {percent}</td>);

        overallTime[j] += Math.round(value.median * 1000);
      }

      rows.push(<tr>{cols}</tr>);
    }

    return (
      <div className="panel panel-default">
        <div className="panel-heading">Results (lower is better)</div>
        <div className="panel-body">
          <h4>Flags:</h4>
          <ul>
            <li><strong>+r</strong> means that library is using DOM recycling, and instead of creating new DOM nodes
              on each update, it reuses them, so it breaks test cases like "render" and "insert".</li>
            <li><strong>+s</strong> means that library is using
              <code>shouldComponentUpdate</code> optimization.</li>
          </ul>
          <p>Don't use <u>Overall time</u> row to make any conclusions, like library X is N times faster than
            library Y. This row is used by library developers to easily check if there is some regression.</p>
          <div className="input-group">
            <span className="input-group-addon">Filter</span>
            <input type="text" className="form-control" placeholder="For example: render" value={filter} onChange={this.handleFilterChange.bind(this)} />
          </div>
          <table className="table table-condensed">
            <thead><tr><th key="empty"></th>{titles}</tr></thead>
            <tbody>
            <tr><td key="empty">Overall Time</td>{overallTime.map((t) => <td>{t}</td>)}</tr>
            {rows}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

class Main extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      disableSCU: false,
      enableDOMRecycling: false,
      mobileMode: false,
      iterations: 3,
      filter: '',
    };

    this.onMobileModeChange = this.onMobileModeChange.bind(this);
    this.onDisableSCUChange = this.onDisableSCUChange.bind(this);
    this.onEnableDOMRecyclingChange = this.onEnableDOMRecyclingChange.bind(this);
    this.onIterationsChange = this.onIterationsChange.bind(this);
    this.onTestFilterChange = this.onTestFilterChange.bind(this);
  }

  onMobileModeChange(e) {
    this.setState({mobileMode: e.target.checked});
  }

  onDisableSCUChange(e) {
    this.setState({disableSCU: e.target.checked});
  }

  onEnableDOMRecyclingChange(e) {
    this.setState({enableDOMRecycling: e.target.checked});
  }

  onIterationsChange(e) {
    this.setState({iterations: e.target.value});
  }

  onTestFilterChange(e) {
    this.setState({testFilter: e.target.value});
  }

  render() {
    return (
      <div>
        <Header />
        <div className="container">
          <div className="panel panel-default">
            <div className="panel-body">
              <div className="checkbox">
                <label>
                  <input type="checkbox" value={this.state.disableSCU} onChange={this.onDisableSCUChange} />
                  Disable <code>shouldComponentUpdate</code> optimization
                </label>
              </div>
              <div className="checkbox">
                <label>
                  <input type="checkbox" value={this.state.enableDOMRecycling} onChange={this.onEnableDOMRecyclingChange} />
                  Enable DOM recycling (if implementation supports changing)
                </label>
              </div>
              <div className="checkbox">
                <label>
                  <input type="checkbox" value={this.state.mobileMode} onChange={this.onMobileModeChange} />
                  Mobile mode
                </label>
              </div>
              <div className="form-group">
                <label for="iterations">Iterations</label>
                <input type="number" className="form-control" id="iterations" value={this.state.iterations} onChange={this.onIterationsChange} />
              </div>
              <div className="form-group">
                <label for="test-filter">Tests filter</label>
                <input type="text" className="form-control" id="test-filter" value={this.state.testFilter} placeholder="For example: render" onChange={this.onTestFilterChange} />
              </div>
            </div>
          </div>
          <Contestants contestants={this.props.contestants} opts={this.state} />
          <ResultsTable results={this.props.results} />
        </div>
      </div>
    );
  }
}

const state = {
  contestants: [
    {
      'name': 'React 0.14',
      'url': 'https://facebook.github.io/react/',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-react/',
      'bundleUrl': 'https://localvoid.github.io/uibench-react/bundle.js',
      'comments': 'Virtual DOM.',
      'size': 0
    },
    {
      'name': 'React 15',
      'url': 'https://facebook.github.io/react/',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-react-dev/',
      'bundleUrl': 'https://localvoid.github.io/uibench-react-dev/bundle.js',
      'comments': 'Virtual DOM. Compiled with: es2015-loose, transform-react-inline-elements.',
      'size': 0
    },
    {
      'name': 'React 15 [Functional Components]',
      'url': 'https://facebook.github.io/react/',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-react-dev/fc.html',
      'bundleUrl': 'https://localvoid.github.io/uibench-react-dev/fc_bundle.js',
      'comments': 'Virtual DOM. Benchmark implementation doesn\'t support sCU optimization. Compiled with: es2015-loose, transform-react-inline-elements.',
      'size': 0
    },
    {
      'name': 'Bobril',
      'url': 'https://github.com/Bobris/Bobril',
      'benchmarkUrl': 'https://bobris.github.io/uibench-bobril/',
      'bundleUrl': 'https://bobris.github.io/uibench-bobril/a.js',
      'comments': 'Virtual DOM.',
      'size': 0
    },
    {
      'name': 'Deku',
      'url': 'https://github.com/dekujs/deku',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-deku/',
      'bundleUrl': 'https://localvoid.github.io/uibench-deku/bundle.js',
      'comments': 'Virtual DOM. Benchmark implementation doesn\'t support sCU optimization, doesn\'t have components/thunks overhead.',
      'size': 0
    },
    {
      'name': 'Mercury',
      'url': 'https://github.com/Raynos/mercury',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-mercury/',
      'bundleUrl': 'https://localvoid.github.io/uibench-mercury/bundle.js',
      'comments': 'Virtual DOM (`virtual-dom` library).',
      'size': 0
    },
    {
      'name': 'kivi [simple]',
      'url': 'https://github.com/localvoid/kivi',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-kivi/simple.html',
      'bundleUrl': 'https://localvoid.github.io/uibench-kivi/simple.js',
      'comments': 'Virtual DOM, simple benchmark implementation without any advanced optimizations.',
      'size': 0
    },
    {
      'name': 'kivi [advanced]',
      'url': 'https://github.com/localvoid/kivi',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-kivi/advanced.html',
      'bundleUrl': 'https://localvoid.github.io/uibench-kivi/advanced.js',
      'comments': 'Virtual DOM, benchmark implementation is using all optimizations that available in kivi API, except for DOM Nodes recycling.',
      'size': 0
    },
    {
      'name': 'Preact',
      'url': 'https://github.com/developit/preact',
      'benchmarkUrl': 'https://developit.github.io/uibench-preact/',
      'bundleUrl': 'https://developit.github.io/uibench-preact/bundle.js',
      'comments': 'Virtual DOM. Using DOM Nodes recycling by default.',
      'size': 0
    },
    {
      'name': 'React-lite',
      'url': 'https://github.com/Lucifier129/react-lite',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-react-lite/',
      'bundleUrl': 'https://localvoid.github.io/uibench-react-lite/bundle.js',
      'comments': 'Virtual DOM.',
      'size': 0
    },
    {
      'name': 'Imba',
      'url': 'https://github.com/somebee/imba',
      'benchmarkUrl': 'https://somebee.github.io/uibench-imba/',
      'bundleUrl': 'https://somebee.github.io/uibench-imba/bundle.js',
      'comments': 'Programming language with UI library that has Virtual DOM like API. Using DOM Nodes recycling by default.',
      'size': 0
    },
    {
      'name': 'yo-yo',
      'url': 'https://github.com/maxogden/yo-yo',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-yo-yo/',
      'bundleUrl': 'https://localvoid.github.io/uibench-yo-yo/main.js',
      'comments': 'Real DOM diff/patch (`morphdom` library). Benchmark implementation doesn\'t support sCU optimization, doesn\'t have components/thunks overhead.',
      'size': 0
    },
    {
      'name': 'yo-yo [nokeys]',
      'url': 'https://github.com/maxogden/yo-yo',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-yo-yo/nokeys.html',
      'bundleUrl': 'https://localvoid.github.io/uibench-yo-yo/nokeys.js',
      'comments': 'Real DOM diff/patch (`morphdom` library). Benchmark implementation doesn\'t support sCU optimization, doesn\'t have components/thunks overhead, doesn\'t use keys to preserve internal state.',
      'size': 0
    },
    {
      'name': 'Snabbdom',
      'url': 'https://github.com/paldepind/snabbdom',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-snabbdom/',
      'bundleUrl': 'https://localvoid.github.io/uibench-snabbdom/bundle.js',
      'comments': 'Virtual DOM.',
      'size': 0
    },
    {
      'name': 'Maquette',
      'url': 'http://maquettejs.org/',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-maquette/',
      'bundleUrl': 'https://localvoid.github.io/uibench-maquette/bundle.js',
      'comments': 'Virtual DOM. Benchmark implementation doesn\'t support sCU optimization, doesn\'t have components/thunks overhead.',
      'size': 0
    },
    {
      'name': 'Vidom',
      'url': 'https://github.com/dfilatov/vidom',
      'benchmarkUrl': 'https://dfilatov.github.io/uibench-vidom/',
      'bundleUrl': 'https://dfilatov.github.io/uibench-vidom/bundle.js',
      'comments': 'Virtual DOM.',
      'size': 0
    },
    {
      'name': 'Inferno',
      'url': 'https://github.com/trueadm/inferno',
      'benchmarkUrl': 'https://trueadm.github.io/uibench-inferno/',
      'bundleUrl': ['https://trueadm.github.io/uibench-inferno/bundle.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/inferno/0.7.16/inferno.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/inferno/0.7.16/inferno-dom.min.js'],
      'comments': 'Virtual DOM. Using DOM Nodes recycling by default.',
      'size': 0
    },
    {
      'name': 'Vanilla [innerHTML]',
      'url': 'https://github.com/localvoid/uibench-vanilla',
      'benchmarkUrl': 'https://localvoid.github.io/uibench-vanilla/innerhtml.html',
      'bundleUrl': 'https://localvoid.github.io/uibench-vanilla/innerhtml.js',
      'comments': 'Benchmark implementation doesn\'t preserve internal state, doesn\'t support sCU optimization, doesn\'t have components/thunks overhead.',
      'size': 0
    }
  ],
  results: new Results()
};

function fetchBundleJs(contestant) {
  if (typeof contestant.bundleUrl === "string") {
    return fetch(contestant.bundleUrl)
      .then((response) => response.text())
      .then((body) => {
        contestant.size = body.length;
      });
  }
  return Promise.all(contestant.bundleUrl.map((url) => {
    return fetch(url)
      .then((response) => response.text())
      .then((body) => body.length);
  })).then((sizes) => {
    contestant.size = sizes.reduce((acc, v) => acc + v, 0);
  });
}

document.addEventListener('DOMContentLoaded', function(e) {
  const container = document.querySelector('#App');

  for (let i = 0; i < state.contestants.length; i++) {
    fetchBundleJs(state.contestants[i])
      .then(() => {
        ReactDOM.render(<Main {...state}/>, container);
      });
  }

  window.addEventListener('message', function(e) {
    const type = e.data.type;
    const data = e.data.data;

    if (type === 'report') {
      state.results.update(data.name, data.version, data.samples);
      ReactDOM.render(<Main {...state}/>, container);
    }
  });

  ReactDOM.render(<Main {...state}/>, container);
});

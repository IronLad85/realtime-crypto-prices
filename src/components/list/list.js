import { QTable, QTh, QTr, QTd, QToggle, QCircularProgress } from "quasar";
import axios from "axios";
import VueApexCharts from "vue-apexcharts";
import moment from "moment";
import graphQLclient from "graphql-client";
import Vue from "vue";

const _graphQLclient = graphQLclient({
  url: "https://graphql.coincap.io"
});

Vue.component("apexchart", VueApexCharts);

export default {
  name: "list",
  components: { QTable, QTh, QTr, QTd, QToggle, QCircularProgress },
  props: [],
  priceListenerSocket: null,
  data() {
    return {
      loading: false,
      selectedCoin: null,
      headerFields: [],
      lastUpdatedData: {},
      isChartLoading: null,
      chartOptions: {
        chart: {
          type: "area",
          height: 350,
          animations: { enabled: true },
          toolbar: {
            show: true,
            tools: {
              download: true,
              selection: true,
              zoom: true,
              zoomin: true,
              zoomout: true,
              pan: false,
              reset: true | '<img src="/static/icons/reset.png" width="20">',
              customIcons: []
            },
            autoSelected: "zoom"
          }
        },
        annotations: {
          yaxis: [
            {
              y: 30,
              borderColor: "#999",
              label: {
                show: true,
                text: "Support",
                style: {
                  color: "#fff",
                  background: "#00E396"
                }
              }
            }
          ],
          xaxis: [
            {
              x: moment().format("x"),
              borderColor: "#999",
              yAxisIndex: 0,
              label: {
                show: true,
                text: "Rally",
                style: {
                  color: "#fff",
                  background: "#775DD0"
                }
              }
            }
          ]
        },
        dataLabels: {
          enabled: false
        },
        markers: {
          size: 0,
          style: "hollow"
        },
        xaxis: {
          type: "datetime",
          min: moment()
            .subtract(10, "days")
            .format("x"),
          max: moment().format("x"),
          tickAmount: 6
        },
        tooltip: {
          x: {
            format: "dd MMM yyyy hh:mm"
          }
        },
        fill: {
          type: "gradient",
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.7,
            opacityTo: 0.9,
            stops: [0, 100]
          }
        }
      },
      selection: "one_year",
      series: [{ data: [] }],

      pagination: {
        sortBy: "desc",
        descending: false,
        page: 1,
        rowsPerPage: 20,
        rowsNumber: 200
      },

      columns: [
        {
          name: "rank",
          required: true,
          label: "Rank",
          align: "center",
          field: row => row.rank,
          format: val => `${val}`,
          sortable: true
        },
        {
          name: "name",
          required: true,
          label: "Name",
          align: "left",
          field: row => row,
          format: val => {
            return { name: val.name, image: val.image, symbol: val.symbol };
          },
          sortable: true
        },
        {
          name: "price",
          align: "right",
          label: "Price",
          field: row => row.priceUsd,
          sortable: true
        },
        {
          name: "marketCap",
          label: "Market Cap",
          field: row => row.marketCapUsd,
          format: val => this.formatMoney(val),
          sortable: true,
          style: "width: 10px"
        },
        { name: "vwap", label: "VWAP(24Hr)", field: row => row.vwapUsd24Hr },
        {
          name: "supply",
          label: "Supply",
          field: row => parseFloat(row.supply),
          format: val => this.formatMoney(val)
        },
        {
          name: "volume",
          label: "Volume (24Hr)",
          field: row => row.volumeUsd24Hr,
          format: val => this.formatMoney(val)
        },
        {
          name: "change",
          label: "Change",
          field: row => row.changePercent24Hr,
          sortable: true,
          sort: (a, b) => parseInt(a, 10) - parseInt(b, 10)
        }
      ],
      data: {},
      coins: []
    };
  },
  computed: {},
  mounted() {
    _graphQLclient
      .query(
        `{
        marketTotal
        {
          marketCapUsd,
          exchangeVolumeUsd24Hr,
          assets,
          exchanges,
          markets,        
        },
        asset(id:"bitcoin"){
          priceUsd,
          marketCapUsd,
          volumeUsd24Hr,          
        }
      }`
      )
      .then(val => {
        let _headerFields = [];
        Object.keys(val.data.marketTotal).forEach((key, index) => {
          if (index > 1) {
            _headerFields.push([key, val.data.marketTotal[key]]);
          } else {
            _headerFields.push([
              index == 0 ? "Market Cap" : "Exchange Vol",
              this.formatMoney(+val.data.marketTotal[key])
            ]);
          }
        });
        this.headerFields = _headerFields;
      })
      .catch(console.log);

    this.fetchData(1, 20)
      .then(snapshot => {
        let _data = {};
        this.loading = true;
        snapshot.data.assets.edges.forEach(eachCoinData => {
          _data[eachCoinData.node.name.toLowerCase()] = {
            ...eachCoinData.node
          };
        });
        this.data = _data;
        this.loading = false;
        this.listenToUpdates();
      })
      .catch(console.log);
  },

  // Component Methods
  methods: {
    async onRequest(props) {
      try {
        const { page, rowsPerPage, sortBy, descending } = props.pagination;
        this.loading = true;
        const fetchCount =
          rowsPerPage === 0 ? this.pagination.rowsNumber : rowsPerPage;
        const startRow = (page - 1) * rowsPerPage;
        let _data = {};
        const snapshot = (await this.fetchData(page, fetchCount)).data.assets
          .edges;
        snapshot.slice(fetchCount * (page - 1), snapshot.length).forEach(
          eachCoinData =>
            (_data[eachCoinData.node.name.toLowerCase()] = {
              ...eachCoinData.node
            })
        );
        this.data = _data;
        this.listenToUpdates();
        this.pagination.page = page;
        this.pagination.rowsPerPage = rowsPerPage;
        this.pagination.sortBy = sortBy;
        this.pagination.descending = descending;
        this.loading = false;
      } catch (err) {
        console.log(err);
      }
    },

    fetchData(startRow, fetchCount) {
      return _graphQLclient.query(
        `
        query {
          assets(direction: ASC, first: ${startRow * fetchCount}, sort:rank) {
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            edges {    
              cursor          
              node {
                changePercent24Hr
                name
                id
                marketCapUsd
                priceUsd
                rank
                supply
                symbol
                volumeUsd24Hr
                vwapUsd24Hr
              }
            }
          }
        }
      `
      );
    },

    formatMoney(n) {
      // Nine Zeroes for Billions
      // if(parseInt(n) < 1) { n = n}
      if (n < 1e3) return n;
      if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + " K";
      if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + " M";
      if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + " B";
    },

    getImageURL(coinObj) {
      return `https://static.coincap.io/assets/icons/${coinObj.symbol.toLowerCase()}@2x.png`;
    },

    openCoinInfoBlock(coinInfo) {
      if (this.selectedCoin != coinInfo.symbol) {
        this.selectedCoin = coinInfo.symbol;
        this.series = [];
        this.isChartLoading = true;
        this.getGraphData(coinInfo.name.toLowerCase());
      } else {
        this.selectedCoin = null;
      }
    },

    getGraphData(coinId) {
      _graphQLclient
        .query(
          `query ($id: ID!, $interval: Interval!, $start: Date, $end: Date) {
          assetHistories(assetId: $id, interval: $interval, start: $start, end:  $end) {
            priceUsd 
            timestamp 
            date 
          }
           asset(id:$id) {
             changePercent24Hr
             name
             symbol 
            }
          }
        `,
          {
            interval: "m5",
            start: moment()
              .subtract(1, "days")
              .format("x"),
            end: moment().format("x"),
            id: coinId
          }
        )
        .then(({ data }) => {
          let _series = [];

          if (data.assetHistories) {
            data.assetHistories.forEach((each, index) => {
              if (index % 2 == 0) {
                _series.push([
                  +each.timestamp,
                  +this.getPriceValue(+parseFloat(each.priceUsd))
                ]);
              }
            });
          }
          this.series = [{ data: _series }];
          this.isChartLoading = false;
        });
    },

    getArrayFromDataObj(data) {
      return Object.values(data);
    },

    getPriceValue(n) {
      return n < 1.0 ? parseFloat(+n).toFixed(8) : parseFloat(+n).toFixed(2);
    },

    getRowClassName(coinName) {
      coinName = coinName.toLowerCase();
      let _lastUpdatedData = { ...this.lastUpdatedData };
      let oldCoin = _lastUpdatedData[coinName];
      let newPrice = +this.getPriceValue(+this.data[coinName].priceUsd);
      if (oldCoin && +this.getPriceValue(oldCoin.priceUsd) != newPrice) {
        if (+this.getPriceValue(oldCoin.priceUsd) < newPrice) {
          return { "price-up": true };
        } else {
          return { "price-down": true };
        }
      }
    },

    listenToUpdates() {
      if (this.priceListenerSocket != null) {
        this.priceListenerSocket.close();
        this.priceListenerSocket = null;
      }
      this.priceListenerSocket = new WebSocket(
        `wss://ws.coincap.io/prices?assets=${Object.keys(this.data).join(",")}`
      );
      this.priceListenerSocket.onmessage = ({ data }) => {
        data = JSON.parse(data);
        if (typeof data == "object") {
          Object.keys(data).forEach(coinName => {
            let newValue = this.getPriceValue(parseFloat(+data[coinName]));
            if (
              this.data[coinName] &&
              this.data[coinName].priceUsd != newValue
            ) {
              let oldCoin = { ...this.data[coinName] };
              this.lastUpdatedData[coinName] = oldCoin;
              this.data[coinName].priceUsd = newValue;
            }
          });
        }
      };
    }
  }
};

const fetch = require("node-fetch");

const referral = "0x0000000000000000000000000000000000000000";

const query = `query {
	lidoSubmissions(where: {referral:"${referral}"}) {
	  amount
  }
}`;

fetch("http://localhost:8000/subgraphs/name/lido-subgraph", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({ query }),
})
  .then((r) => r.json())
  .then((data) => {
    const submissions = data.data.lidoSubmissions;

    const total = submissions.reduce(
      (a, b) => (a.amount ? parseInt(a.amount) : a + parseInt(b.amount)),
      0
    );
    console.log("This referrer ID referred a total of:", total);
  });

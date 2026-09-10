import axios from 'axios'

// The API is authenticated with bearer tokens (localStorage), not cookies,
// so credentials are deliberately NOT attached to cross-origin requests.
const api = axios.create({
  baseURL: 'http://127.0.0.1:5000/api', // Adjust as needed
})

export default api

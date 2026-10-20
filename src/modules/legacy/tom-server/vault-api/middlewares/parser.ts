/* istanbul ignore file */
import express from 'express'
import type { RequestHandler } from 'express'

const parser: RequestHandler[] = [express.json(), express.urlencoded({ extended: false })]
export default parser

import {expect} from 'chai'
import fs from 'node:fs'

import {isWindows, setupTempNetrcDir, skipUnlessAcceptanceEnv} from './acceptance-helpers.js'

describe('acceptance helpers', function () {
  before(function () {
    skipUnlessAcceptanceEnv(this)
  })

  describe('setupTempNetrcDir', function () {
    it('should setup and restore a temp directory', function () {
      const originalHome = process.env.HOME
      const originalUserProfile = process.env.USERPROFILE

      const {dir, restore} = setupTempNetrcDir()

      expect(fs.existsSync(dir)).to.be.true
      expect(dir).to.include('heroku-credential-manager-acceptance-')
      expect(process.env.HOME).to.equal(dir)

      if (isWindows()) {
        expect(process.env.USERPROFILE).to.equal(dir)
      }

      restore()

      expect(fs.existsSync(dir)).to.be.false
      expect(process.env.HOME).to.equal(originalHome)

      if (isWindows()) {
        expect(process.env.USERPROFILE).to.equal(originalUserProfile)
      }
    })
  })
})

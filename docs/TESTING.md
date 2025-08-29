# 🧪 Testing Mustache JSON Validator Extension

## **📋 Pre-Debug Setup**

### **1. Initial Setup:**

```bash
# Navigate to your extension directory
cd mustache-json-validator

# Install dependencies
npm install

# Compile TypeScript (important!)
npm run compile
```

### **2. Verify Structure:**

Ensure your project has this structure:

```
mustache-json-validator/
├── src/
├── package.json
├── tsconfig.json
├── out/ (created after compile)
└── README.md
```

## **🚀 Debug Mode Launch Steps**

### **Step 1: Open Extension Project**

1. **Open VSCode**
2. **File > Open Folder**
3. **Select your `mustache-json-validator` directory**
4. **Wait for TypeScript to activate**

### **Step 2: Launch Extension Development Host**

1. **Press `F5`** (or Run > Start Debugging)
2. **Select "VS Code Extension Development"** if prompted
3. **Wait 3-5 seconds** for new window to open
4. **New window title will show: `[Extension Development Host]`**

### **Step 3: Verify Extension Loaded**

In the Extension Development Host window:

1. **Check status bar bottom-left** - should show extension loading
2. **Open Command Palette** (`Cmd+Shift+P`)
3. **Type "Mustache"** - should see your commands:
   - ✅ `Mustache JSON: Validate Template`
   - ✅ `Mustache JSON: Preview Generated JSON`
   - ✅ `Mustache JSON: Select Context File`

## **📝 Create Test Files**

### **Test File 1: `sample.mustache.json`** ✅ Simple Valid Template

```json
{
  "users": [
{{#users}}
    {
      "id": {{id}},
      "name": "{{name}}",
      "email": "{{email}}",
      "status": "{{#isActive}}active{{/isActive}}{{^isActive}}inactive{{/isActive}}",
      "age": {{profile.age}},
      "location": "{{profile.location}}"
    }{{#comma}},{{/comma}}
{{/users}}
  ],
  "metadata": {
    "total": {{totalUsers}},
    "generated": "{{timestamp}}"
  }
}
```

### **Test File 2: `context.json`** 📊 Sample Data

```json
{
  "users": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "isActive": true,
      "profile": {
        "age": 30,
        "location": "New York"
      },
      "comma": true
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "email": "jane@example.com",
      "isActive": false,
      "profile": {
        "age": 25,
        "location": "San Francisco"
      },
      "comma": false
    }
  ],
  "totalUsers": 2,
  "timestamp": "2025-08-29T10:30:00Z"
}
```

### **Test File 3: `broken.mustache.json`** ❌ With Intentional Errors

```json
{
  "users": [
    {{#users}}
    {
      "id": {{id}},
      "name": "{{name}}",
      "email": "{{email}}",
      {{#isActive}}
      "status": "active",
      {{/wrongName}}
      "invalid": {{unclosedTag
    }
    {{/users}}
  ]
}
```

## **🎯 Expected Behaviors**

### **When Opening `sample.mustache.json`:**

✅ **Should See:**

- ✅ **No red squiggly lines** (template is valid)
- ✅ **Status bar shows:** "✓ Mustache: Valid"
- ✅ **Problems panel:** Empty or minimal warnings

❌ **Should NOT See:**

- ❌ Red squiggly lines under JSON values like `"name"`
- ❌ Errors about "single braces" on normal JSON

### **When Opening `broken.mustache.json`:**

✅ **Should See:**

- 🔴 **Red squiggly line** under `{{/wrongName}}` (mismatched section)
- 🔴 **Red squiggly line** under `{{unclosedTag` (unclosed tag)
- ⚠️ **Status bar shows:** "⚠️ Mustache: 2 errors"
- 📋 **Problems panel:** Shows detailed errors

### **When Running Commands:**

#### **Validate Command** (`Cmd+Shift+V`):

1. **Should show:** Progress notification "Validating Mustache template..."
2. **Should show:** Results notification with error count
3. **Should update:** Problems panel with issues

#### **Preview Command** (`Cmd+Alt+P`):

1. **Should show:** Progress notification "Generating JSON preview..."
2. **Should open:** New tab with formatted JSON output
3. **If no context:** Should use sample/empty data

#### **Select Context Command:**

1. **Should open:** File browser dialog
2. **Should filter:** Only `.json` files
3. **After selection:** Should re-validate with new context

## **🔍 Testing Checklist**

### **Real-time Validation:**

- [ ] ✅ Red squiggly lines appear on syntax errors
- [ ] ✅ Hover shows detailed error messages
- [ ] ✅ Problems panel updates automatically
- [ ] ✅ Status bar shows current validation status
- [ ] ✅ Validation runs while typing (debounced)

### **Commands Work:**

- [ ] ✅ `Cmd+Shift+V` validates current file
- [ ] ✅ `Cmd+Alt+P` opens JSON preview
- [ ] ✅ Command Palette shows all Mustache commands
- [ ] ✅ Commands are disabled for non-Mustache files

### **File Type Detection:**

- [ ] ✅ `.mustache` files are recognized
- [ ] ✅ `.mustache.json` files are recognized
- [ ] ✅ `.mst.json` files are recognized
- [ ] ✅ Regular `.json` files are ignored

### **Error Detection:**

- [ ] ✅ Unclosed tags: `{{variable` → Error
- [ ] ✅ Mismatched sections: `{{#users}} {{/user}}` → Error
- [ ] ✅ Empty tags: `{{}}` → Error
- [ ] ❌ JSON values: `"name": "John"` → No Error

## **🐛 Troubleshooting**

### **Extension Not Loading:**

1. **Check Output panel** → Select "Extension Host"
2. **Look for errors** in red
3. **Try:** `Cmd+R` to reload Extension Development Host
4. **Verify:** `npm run compile` completed successfully

### **Commands Not Appearing:**

1. **Check:** Command Palette (`Cmd+Shift+P`)
2. **Verify:** Extension activated (check status bar)
3. **Try:** Restart Extension Development Host (`F5` again)

### **No Validation Errors Showing:**

1. **Check:** File extension is `.mustache`, `.mustache.json`, or `.mst.json`
2. **Verify:** "Enable Real-time Validation" in settings
3. **Check:** Problems panel (`Cmd+Shift+M`)

### **False Positive Errors:**

- **JSON values showing as errors** → This was a bug, should be fixed now
- **Valid Mustache flagged** → Check syntax carefully

## **📊 Debug Console**

### **View Extension Logs:**

1. **View > Output**
2. **Select:** "Extension Host" from dropdown
3. **Look for:** Console.log messages from extension
4. **Check for:** Red error messages

### **Advanced Debugging:**

1. **`Cmd+Shift+P`** → "Developer: Toggle Developer Tools"
2. **Console tab:** JavaScript errors and logs
3. **Sources tab:** Set breakpoints in TypeScript code
4. **Network tab:** File loading issues

## **✅ Success Criteria**

Your extension is working correctly if:

1. ✅ **Extension loads** without errors in debug mode
2. ✅ **Commands appear** in Command Palette
3. ✅ **Real-time validation** shows red squiggly lines for errors
4. ✅ **Preview command** generates JSON output
5. ✅ **No false positives** on valid JSON syntax
6. ✅ **Context file** selection and usage works
7. ✅ **Performance** is responsive with reasonable-sized files

## **🎉 Ready for Production**

Once all tests pass, your extension is ready for:

- **Packaging** (`vsce package`)
- **Publishing** to VSCode Marketplace
- **Real-world usage**

---

**Need help with any specific issue? Check the troubleshooting section or ask for assistance!**
